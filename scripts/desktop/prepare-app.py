"""Build a signed local copy of TurboWarp Desktop 1.17.1 with the Plus renderer."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import struct
import subprocess


def digest(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"Expected one Desktop integration point: {old!r}")
    return source.replace(old, new)


def prepare(source, output, build, test_control):
    if output.exists() or output.resolve() == source.resolve():
        raise ValueError("Use a new output .app path for the disposable copy")
    info_path = Path("Contents/Info.plist")
    asar_path = Path("Contents/Resources/app.asar")
    info = plistlib.loads((source / info_path).read_bytes())
    if info["CFBundleShortVersionString"] != "1.17.1":
        raise ValueError("This adapter targets TurboWarp Desktop 1.17.1")
    integrity = info["ElectronAsarIntegrity"]["Resources/app.asar"]
    archive = (source / asar_path).read_bytes()
    _, header_size, _, json_size = struct.unpack_from("<4I", archive)
    original_header = archive[16:16 + json_size]
    if integrity["algorithm"] != "SHA256" or integrity["hash"] != digest(original_header):
        raise ValueError("Source bundle ASAR integrity does not match")
    header = json.loads(original_header)
    data = bytearray(archive[8 + header_size:])

    def folder_and_name(name):
        *parents, leaf = name.split("/")
        folder = header["files"]
        for component in parents:
            folder = folder.setdefault(component, {"files": {}})["files"]
        return folder, leaf

    def read(name):
        folder, leaf = folder_and_name(name)
        entry = folder[leaf]
        offset = int(entry["offset"])
        return bytes(data[offset:offset + entry["size"]])

    def write(name, contents):
        folder, leaf = folder_and_name(name)
        block_size = 4 * 1024 * 1024
        blocks = [digest(contents[i:i + block_size]) for i in range(0, len(contents), block_size)]
        folder[leaf] = {"size": len(contents), "offset": str(len(data)), "integrity": {
            "algorithm": "SHA256", "hash": digest(contents), "blockSize": block_size,
            "blocks": blocks or [digest(b"")],
        }}
        data.extend(contents)

    root = Path(__file__).resolve().parents[2]
    editor_path = "src-main/windows/editor.js"
    editor = read(editor_path).decode()
    editor = replace_once(editor, "    this.loadURL('tw-editor://./gui/gui.html');",
                          "    this.plusBackpack = require('./plus-backpack-host.cjs').createBackpackWindowHost(this.window);\n"
                          "    this.loadURL(this.plusBackpack.editorURL);")
    editor = replace_once(editor, "  handleWindowOpen (details) {",
                          "  handleWindowOpen (details) {\n"
                          "    const plusPolicy = this.plusBackpack?.handleWindowOpen(details);\n"
                          "    if (plusPolicy) return plusPolicy;\n")
    write(editor_path, editor.encode())
    write("src-main/windows/plus-backpack-host.cjs",
          (root / "scripts/desktop/backpack-window-host.cjs").read_bytes())
    if test_control:
        entry_path = "src-main/entrypoint.js"
        write(entry_path, read(entry_path) + b"\nif (process.env.TW_PLUS_DESKTOP_TEST_CONTROL === '1') "
              b"require('./plus-desktop-test-control.cjs');\n")
        write("src-main/plus-desktop-test-control.cjs",
              (root / "test/stage3/desktop-control.cjs").read_bytes())

    for page in ("gui.html", "backpack-popout.html", "stage-popout.html"):
        if not (build / page).is_file():
            raise ValueError(f"Missing Desktop build asset: {page}")
    for asset in sorted(build.rglob("*")):
        relative = asset.relative_to(build)
        if asset.is_file() and relative.parts[0] != "translation-messages":
            write(f"dist-renderer-webpack/editor/gui/{relative.as_posix()}", asset.read_bytes())

    raw_header = json.dumps(header, separators=(",", ":")).encode()
    payload = struct.pack("<I", len(raw_header)) + raw_header + b"\0" * (-len(raw_header) % 4)
    pickle = struct.pack("<I", len(payload)) + payload
    integrity["hash"] = digest(raw_header)
    subprocess.run(["/bin/cp", "-cR", str(source), str(output)], check=True)
    with (output / asar_path).open("wb") as target:
        target.write(struct.pack("<II", 4, len(pickle)))
        target.write(pickle)
        target.write(data)
    (output / info_path).write_bytes(plistlib.dumps(info))
    subprocess.run(["/usr/bin/codesign", "--force", "--deep", "--sign", "-",
                    "--preserve-metadata=entitlements", str(output)], check=True)
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(output)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source", type=Path, default=Path("/Applications/TurboWarp.app"))
    parser.add_argument("--build", type=Path, required=True)
    parser.add_argument("--test-control", action="store_true")
    args = parser.parse_args()
    prepare(args.source, args.output, args.build, args.test_control)
