import AppKit
import ApplicationServices

enum PickerError: Error, CustomStringConvertible {
    case message(String)
    var description: String { switch self { case .message(let text): return text } }
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

func elements(_ element: AXUIElement, _ name: String) -> [AXUIElement] {
    return attribute(element, name) as? [AXUIElement] ?? []
}

func descendants(_ element: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    guard depth < 12 else { return [] }
    // Native dialogs are outside web content and file-list rows; avoid stale, expensive subtrees.
    if ["AXWebArea", "AXTable", "AXOutline", "AXList", "AXBrowser"].contains(role(element)) { return [element] }
    return [element] + elements(element, kAXChildrenAttribute).flatMap { descendants($0, depth: depth + 1) }
}

func role(_ element: AXUIElement) -> String { attribute(element, kAXRoleAttribute) as? String ?? "" }

func waitFor(_ stage: String, timeout: TimeInterval = 15, predicate: () -> Bool) throws {
    let deadline = Date().addingTimeInterval(timeout)
    while !predicate() {
        if Date() >= deadline { throw PickerError.message("Timed out waiting for \(stage)") }
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    print(stage)
}

func main() throws {
    guard CommandLine.arguments.count == 3, let pid = Int32(CommandLine.arguments[1]), pid > 0,
          let target = NSRunningApplication(processIdentifier: pid),
          target.bundleIdentifier == "com.google.Chrome" else {
        throw PickerError.message("Expected the isolated Google Chrome process PID")
    }
    guard AXIsProcessTrusted() else { throw PickerError.message("Accessibility permission is required") }
    let file = CommandLine.arguments[2]
    guard file.hasSuffix(".sb3"), FileManager.default.fileExists(atPath: file) else {
        throw PickerError.message("Expected the downloaded sb3 fixture")
    }
    // AXCreateApplication retains PID identity even when several Chrome instances share a name.
    let application = AXUIElementCreateApplication(pid)
    func windows() -> [AXUIElement] { elements(application, kAXWindowsAttribute) }
    func sheets() -> [AXUIElement] {
        windows().flatMap { descendants($0) }.filter { role($0) == kAXSheetRole }
    }
    func focusedWithin(_ ancestor: AXUIElement) -> Bool {
        var element = attribute(application, kAXFocusedUIElementAttribute)
        for _ in 0..<20 {
            guard let current = element else { return false }
            let node = current as! AXUIElement
            if CFEqual(node, ancestor) { return true }
            element = attribute(node, kAXParentAttribute)
        }
        return false
    }
    var guardedPanel: AXUIElement?
    func requireFocus() throws {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else {
            throw PickerError.message("The isolated Chrome process lost focus; no keystrokes sent")
        }
        if let guardedPanel, !focusedWithin(guardedPanel) {
            throw PickerError.message("The owned native panel lost focus; no keystrokes sent")
        }
    }
    func sendScript(_ statement: String) throws {
        try requireFocus()
        let task = Process()
        let errors = Pipe()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", "on run argv", "-e", "with timeout of 10 seconds",
                          "-e", "tell application \"System Events\" to " + statement,
                          "-e", "end timeout", "-e", "end run"]
        task.standardOutput = Pipe(); task.standardError = errors
        try task.run(); task.waitUntilExit()
        guard task.terminationStatus == 0 else {
            let detail = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            throw PickerError.message("Native keyboard operation failed: \(detail)")
        }
    }
    func key(_ code: CGKeyCode) throws {
        if code == 5 { try sendScript("keystroke \"g\" using {command down, shift down}") }
        else if code == 36 { try sendScript("key code 36") }
        else { throw PickerError.message("Unsupported native keyboard operation") }
    }
    target.activate(options: [.activateAllWindows])
    try waitFor("isolated-chrome: focused") { NSWorkspace.shared.frontmostApplication?.processIdentifier == pid }
    var panel: AXUIElement?
    try waitFor("native-open-panel: visible") {
        panel = sheets().first
        return panel != nil
    }
    guard let panel else { throw PickerError.message("Native panel unavailable") }
    guardedPanel = panel
    try waitFor("native-open-panel: focused") { focusedWithin(panel) }
    try key(5)
    var textField: AXUIElement?
    var locationDialog: AXUIElement?
    try waitFor("go-to-folder: visible") {
        guard let focused = attribute(application, kAXFocusedUIElementAttribute) else { return false }
        let field = focused as! AXUIElement
        guard role(field) == kAXTextFieldRole else { return false }
        var element = attribute(field, kAXParentAttribute)
        var nestedDialog: AXUIElement?
        for _ in 0..<20 {
            guard let current = element else { return false }
            let node = current as! AXUIElement
            if CFEqual(node, panel) {
                // An initial Open-panel search field has no additional dialog ancestor.
                guard let nestedDialog else { return false }
                textField = field
                locationDialog = nestedDialog
                return true
            }
            if role(node) == kAXSheetRole || role(node) == "AXDialog" { nestedDialog = node }
            element = attribute(node, kAXParentAttribute)
        }
        return false
    }
    guard let textField, let locationDialog else { throw PickerError.message("Path field unavailable") }
    try requireFocus()
    // Set the native text control directly to preserve Japanese paths across input methods.
    guard AXUIElementSetAttributeValue(textField, kAXValueAttribute as CFString, file as CFString) == .success else {
        throw PickerError.message("Could not set the native path field")
    }
    try waitFor("go-to-folder: path entered") {
        (attribute(textField, kAXValueAttribute) as? String) == file
    }
    try key(36)
    func panelVisible() -> Bool { sheets().contains { CFEqual($0, panel) } }
    try waitFor("go-to-folder: accepted") {
        !panelVisible() || (focusedWithin(panel) && !descendants(panel).contains { CFEqual($0, locationDialog) })
    }
    if panelVisible() { try key(36) }
    try waitFor("native-open-panel: closed") { !panelVisible() }
}

do { try main() } catch {
    FileHandle.standardError.write(Data("native-picker: \(error)\n".utf8))
    exit(1)
}
