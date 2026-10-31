import { createEmbeddedYamlDocument } from "./document.js";
import { renderBlockPreview } from "./block-preview.js";
import { focusDocumentReference } from "./focus-document.js";
import { attachEmbeddedYamlHat } from "./hat-entry.js";
import { getYamlEditorProviders } from "./provider-bootstrap.js";
import { attachDialogWindow } from "./dialog-window.js";

const messages = {
  ja: {
    title: "組み込み文書",
    close: "閉じる",
    maximize: "全画面化",
    restore: "元のサイズに戻す",
    cancel: "キャンセル",
    save: "表示されている形式に変換して検証・保存",
    document: "文書",
    selectOne: "文書を選択してください",
    format: "形式",
    noSchema: "なし",
    docs: "DSLの説明",
    validate: "文書を検証",
    validateSchema: "JSON Schemaで検証",
    edit: "VSCodeで編集",
    open: "文書を確認・編集",
    ready: "",
    localOnly:
      "VSCodeで編集するには、ローカル連携からTurboWarp-Plus-Editorを開いてください。",
    starting: "VSCodeを開いています…",
    editing:
      "VSCodeで文書を保存してから、画面下のボタンでエディターへ反映してください。",
    externalHint:
      "VSCodeの内容を先にエディターへ反映してから形式を切り替えてください。",
    switchHint:
      "別の文書へ移るには、保存またはキャンセルでこの画面を閉じてください。",
    preview: "保存されている原文（プレビュー）",
    draft: "VSCodeの保存内容（エディターへは未反映）",
    validating: "文書を検証しています…",
    validated: "文書の検証が完了しました。作品は変更していません。",
    validationFailed: "文書の検証に失敗しました。作品は変更していません。",
    validationUnavailable: "現在のブロックを検証する機能が提供されていません。",
    saving: "エディターへ保存しています…",
    saved: "エディターへ反映しました。",
    saveFailed: "保存できませんでした。編集内容は保持しています。",
    failed: "操作を完了できませんでした。",
    tooLarge: "文書のサイズが上限を超えています。",
    unavailable: "この文書は現在利用できません。",
    replaced:
      "作品が切り替わったため、編集を取り消しました。VSCodeのファイルは保持しています。",
    convert: "表現を変換",
    fromSource: "原文から",
    toSource: "原文へ反映",
    rawYAML: "原文YAML",
    rawJSON: "原文JSON",
    yamlBlocks: "共通YAMLブロック",
    schemaBlocks: "台本ブロック",
    conversionSource: "変換元の原文",
    confirmConversion: (label) => `${label}形式に変換しますか？`,
    conversionUnavailable:
      "選択した変換は利用できなくなりました。変換先を選び直してください。",
    preparingConversion: "変換する内容を検証しています…",
    conversionFailed: "変換できませんでした。原文と作品を確認してください。",
    active: "💽=現在保存されている形式",
    source: "原文",
    viaSource:
      "別の表現へ変換する前に、現在のブロックの変更を原文へ反映してください。",
    errorHeading: "エラー",
  },
  en: {
    title: "Embedded document",
    close: "Close",
    maximize: "Maximize",
    restore: "Restore window",
    cancel: "Cancel",
    save: "Convert, validate and save the displayed format",
    document: "Document",
    selectOne: "Select a document",
    format: "Format",
    noSchema: "none",
    docs: "DSL documentation",
    validate: "Validate document",
    validateSchema: "Validate with JSON Schema",
    edit: "Edit in VSCode",
    open: "View or edit document",
    ready: "",
    localOnly:
      "Open TurboWarp-Plus-Editor through the local companion to edit in VSCode.",
    starting: "Opening VSCode…",
    editing:
      "Save the document in VSCode, then choose “Save” here to apply it to the Editor.",
    externalHint: "Apply the VSCode content with “Save” before converting.",
    switchHint:
      "Save or cancel and close this dialog before choosing another document.",
    preview: "Stored source (preview)",
    draft: "Saved VSCode content (not yet applied to the Editor)",
    validating: "Validating the document…",
    validated: "Document validation completed. The project is unchanged.",
    validationFailed: "Document validation failed. The project is unchanged.",
    validationUnavailable:
      "This owner does not provide validation for the current blocks.",
    saving: "Saving to the Editor…",
    saved: "Changes applied to the Editor.",
    saveFailed: "Could not save. Your editing content is retained.",
    failed: "The operation could not be completed.",
    tooLarge: "The document exceeds the size limit.",
    unavailable: "This document is currently unavailable.",
    replaced:
      "The project changed, so this edit was cancelled. The VSCode file is retained.",
    convert: "Convert representation",
    fromSource: "From source",
    toSource: "Apply to source",
    rawYAML: "YAML source",
    rawJSON: "JSON source",
    yamlBlocks: "Common YAML blocks",
    schemaBlocks: "Script blocks",
    conversionSource: "Source for conversion",
    confirmConversion: (label) => `Convert to ${label}?`,
    conversionUnavailable:
      "The selected conversion is no longer available. Choose a conversion again.",
    preparingConversion: "Validating the conversion…",
    conversionFailed: "Conversion failed. Check the source and project.",
    active: "💽=Currently saved format",
    source: "Source",
    viaSource:
      "Apply the current block changes to source before converting to another representation.",
    errorHeading: "Error",
  },
};

export function mountYamlEditor({
  vm,
  getScratch,
  registry: registryOption,
  readReference: readReferenceOption,
  document: documentOption,
  fetch: fetchOption,
  language,
} = {}) {
  if (!vm) throw new TypeError("An Editor VM is required.");
  const doc = documentOption || globalThis.document,
    win = doc.defaultView,
    fetcher = fetchOption || win.fetch.bind(win);
  const providers = getYamlEditorProviders(vm),
    registry = registryOption || providers.registry,
    readReference = readReferenceOption || providers.readReference;
  const locale =
    language ||
    new URLSearchParams(win.location.search).get("lang") ||
    doc.documentElement.lang;
  const text = messages[String(locale).startsWith("ja") ? "ja" : "en"];
  const dialog = doc.createElement("dialog");
  dialog.className = "twpe-yaml-dialog";
  const heading = doc.createElement("h2");
  heading.id = "twpe-yaml-title";
  heading.textContent = text.title;
  dialog.setAttribute("aria-labelledby", heading.id);
  const closeButton = button("×");
  closeButton.className = "twpe-yaml-close";
  closeButton.setAttribute("aria-label", text.close);
  closeButton.title = text.close;
  const maximizeButton = button("⛶");
  maximizeButton.className = "twpe-yaml-maximize";
  const windowActions = doc.createElement("div");
  windowActions.className = "twpe-yaml-window-actions";
  windowActions.append(maximizeButton, closeButton);
  const selectionRow = paragraph(),
    selectionLabel = doc.createElement("label"),
    selection = doc.createElement("select");
  selection.id = "twpe-yaml-document";
  selectionLabel.htmlFor = selection.id;
  selectionLabel.textContent = `${text.document}: `;
  selectionRow.append(selectionLabel, selection);
  const sourceName = doc.createElement("strong"),
    formatNote = doc.createElement("span"),
    schemaNote = paragraph();
  sourceName.className = "twpe-yaml-title-filename";
  formatNote.className = "twpe-yaml-title-format";
  schemaNote.className = "twpe-yaml-source-name";
  const titlebar = doc.createElement("header");
  titlebar.className = "twpe-yaml-titlebar";
  titlebar.append(heading, sourceName, formatNote, windowActions);
  const actions = doc.createElement("div");
  actions.className = "twpe-yaml-actions";
  const docsLink = doc.createElement("a");
  docsLink.textContent = text.docs;
  docsLink.target = "_blank";
  docsLink.rel = "noopener noreferrer";
  const editButton = button(text.edit);
  actions.append(docsLink, editButton);
  const conversions = doc.createElement("section");
  conversions.setAttribute("aria-label", text.convert);
  const activeNote = paragraph(),
    representationHint = paragraph(),
    externalHint = paragraph(),
    switchHint = paragraph();
  activeNote.className = "twpe-yaml-source-name";
  externalHint.textContent = text.externalHint;
  switchHint.textContent = text.switchHint;
  const tablist = doc.createElement("div");
  tablist.className = "twpe-yaml-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", text.format);
  const tabToolbar = doc.createElement("div");
  tabToolbar.className = "twpe-yaml-tab-toolbar";
  tabToolbar.append(tablist, actions);
  const panel = doc.createElement("div");
  panel.id = "twpe-yaml-tabpanel";
  panel.setAttribute("role", "tabpanel");
  panel.tabIndex = 0;
  conversions.append(activeNote, representationHint, externalHint, tabToolbar);
  const status = paragraph();
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const error = paragraph();
  error.className = "twpe-yaml-error";
  error.setAttribute("role", "alert");
  error.setAttribute("aria-label", text.errorHeading);
  const previewLabel = doc.createElement("label");
  previewLabel.htmlFor = "twpe-yaml-preview";
  const preview = doc.createElement("textarea");
  preview.id = previewLabel.htmlFor;
  preview.readOnly = true;
  preview.spellcheck = false;
  const blockPreview = doc.createElement("div");
  blockPreview.className = "twpe-yaml-block-preview";
  blockPreview.setAttribute("aria-label", "ブロックのプレビュー");
  const previewLoading = paragraph();
  previewLoading.setAttribute("role", "status");
  previewLoading.textContent = String(locale).startsWith("ja")
    ? "プレビューを表示しています…"
    : "Loading preview…";
  const footer = doc.createElement("div");
  footer.className = "twpe-yaml-footer";
  const cancelButton = button(text.cancel),
    saveButton = button(text.save);
  saveButton.className = "twpe-yaml-save";
  footer.append(cancelButton, saveButton);
  panel.append(
    status,
    error,
    previewLoading,
    previewLabel,
    preview,
    blockPreview,
  );
  const content = doc.createElement("div");
  content.className = "twpe-yaml-content";
  content.append(
    selectionRow,
    schemaNote,
    conversions,
    switchHint,
    panel,
  );
  dialog.append(titlebar, content, footer);
  const dialogWindow = attachDialogWindow({
    dialog, titlebar, maximizeButton, maximizeLabel: text.maximize, restoreLabel: text.restore,
  });
  const confirmation = doc.createElement("dialog");
  confirmation.className = "twpe-yaml-dialog twpe-yaml-confirmation";
  const confirmationMessage = paragraph();
  confirmationMessage.id = "twpe-yaml-confirmation-title";
  confirmation.setAttribute("aria-labelledby", confirmationMessage.id);
  const confirmationFooter = doc.createElement("div");
  confirmationFooter.className = "twpe-yaml-footer";
  const confirmationCancel = button("Cancel"),
    confirmationOK = button("OK");
  confirmationFooter.append(confirmationCancel, confirmationOK);
  confirmation.append(confirmationMessage, confirmationFooter);
  doc.body.append(dialog, confirmation);
  let disposed = false,
    epoch = 0,
    pending = false,
    commitLocked = false,
    converting = false,
    ignoredCloseEvents = 0;
  let bridge = null,
    adapter = null,
    selected = null,
    snapshot = null,
    session = null,
    draft = null,
    conversionRequest = null,
    selectedRepresentation = null,
    confirmRequested = null,
    opener = null,
    hatEntry = null,
    replacementNotice = false,
    actionStatus = "";
  let previewGeneration = 0,
    previewAttempt = null,
    previewReady = null,
    previewHandle = null,
    previewAbort = null,
    previewPending = false;
  let optionReferences = new Map(),
    representationOptions = new Map();
  const key = (reference) =>
    JSON.stringify([reference.providerId, reference.documentId]);
  const same = (a, b) => Boolean(a && b && key(a) === key(b));
  function paragraph(content = "") {
    const node = doc.createElement("p");
    node.textContent = content;
    return node;
  }
  function button(label) {
    const node = doc.createElement("button");
    node.type = "button";
    node.textContent = label;
    return node;
  }
  function showStatus(message) {
    actionStatus = message;
    status.textContent = message;
  }
  function showError(cause, message = text.failed) {
    error.textContent = `${message}${cause?.message ? ` ${cause.message}` : ""}`;
    error.tabIndex = -1;
    if (dialog.open) error.focus();
  }
  function entries() {
    try {
      return registry.list();
    } catch {
      return [];
    }
  }
  function metadata() {
    return entries().find((entry) => same(entry.reference, selected));
  }
  function inspect() {
    try {
      return adapter?.inspect() || { available: false };
    } catch (cause) {
      return { available: false, reason: cause.message };
    }
  }
  function hasWork() {
    return Boolean(session) || draft !== null || Boolean(conversionRequest);
  }
  function current(generation, owner = adapter) {
    return !disposed && epoch === generation && adapter === owner;
  }
  function displayedPreviewMatches() {
    return Boolean(
      previewReady &&
      !previewPending &&
      previewReady.owner === adapter &&
      previewReady.snapshot === snapshot &&
      previewReady.kind === selectedRepresentation,
    );
  }
  function samePreviewAttempt() {
    return (
      previewAttempt?.owner === adapter &&
      previewAttempt.snapshot === snapshot &&
      previewAttempt.kind === selectedRepresentation
    );
  }
  function resetPreview() {
    previewGeneration++;
    previewAbort?.abort();
    previewAbort = null;
    previewHandle?.dispose();
    previewHandle = null;
    previewReady = null;
    previewAttempt = null;
    previewPending = false;
    blockPreview.replaceChildren();
  }
  async function loadPreview() {
    if (!adapter || !snapshot) return;
    const generation = epoch,
      owner = adapter,
      baseline = snapshot,
      kind = selectedRepresentation,
      token = ++previewGeneration;
    previewAbort?.abort();
    const controller = new AbortController();
    previewAbort = controller;
    previewHandle?.dispose();
    previewHandle = null;
    blockPreview.replaceChildren();
    if (kind === "source") preview.value = "";
    previewAttempt = { owner, snapshot: baseline, kind };
    previewReady = null;
    previewPending = true;
    render();
    const valid = () =>
      current(generation, owner) &&
      snapshot === baseline &&
      selectedRepresentation === kind &&
      previewGeneration === token;
    try {
      // Paint the selected tab and loading state before invoking an owner conversion.
      await new Promise((resolve) => {
        if (typeof win.requestAnimationFrame === "function")
          win.requestAnimationFrame(() => win.setTimeout(resolve, 0));
        else win.setTimeout(resolve, 0);
      });
      if (!valid()) return;
      const model =
        kind === "source" && draft !== null
          ? { kind, source: draft }
          : typeof owner.previewRepresentation === "function"
            ? await owner.previewRepresentation(baseline, { kind })
            : kind === "source" &&
                (metadata()?.activeRepresentation || "source") === "source"
              ? { kind, source: baseline.source }
              : null;
      if (!valid()) return;
      if (!model || model.kind !== kind || typeof model.source !== "string")
        throw new Error("The owner did not provide a preview for this format.");
      if (kind === "source") preview.value = model.source;
      else {
        const handle = await renderBlockPreview({
          container: blockPreview,
          model,
          getScratch: getScratch || (() => win.Scratch),
          vm,
            signal: controller.signal,
        });
        if (!valid()) {
          handle?.dispose();
          return;
        }
        previewHandle = handle;
      }
      if (!valid()) return;
      previewReady = { owner, snapshot: baseline, kind, source: model.source };
    } catch (cause) {
      if (valid()) showError(cause);
    } finally {
      if (valid()) {
        previewPending = false;
        render();
      }
    }
  }
  function formatLabel(kind, entry = metadata()) {
    if (kind === "source")
      return entry?.format === "json" ? text.rawJSON : text.rawYAML;
    if (kind === "yaml-blocks") return text.yamlBlocks;
    if (kind === "schema-blocks") return text.schemaBlocks;
    return (
      entry?.representations?.find((item) => item.kind === kind)?.label || kind
    );
  }
  function formatOptions(entry = metadata()) {
    const active = entry?.activeRepresentation || "source";
    const capabilities = entry?.representations || [];
    const activeCapability = capabilities.find((item) => item.kind === active);
    const options = new Map([
      [
        "source",
        {
          label: formatLabel("source", entry),
          available:
            active === "source" ||
            Boolean(
              activeCapability?.toSource &&
              activeCapability.available !== false,
            ),
          request:
            active === "source"
              ? null
              : { kind: active, direction: "to-source" },
        },
      ],
    ]);
    for (const item of capabilities)
      options.set(item.kind, {
        label: formatLabel(item.kind, entry),
        available:
          item.kind === active ||
          Boolean(
            item.available !== false &&
            (active === "source"
              ? item.fromSource
              : item.fromRepresentations?.includes(active)),
          ),
        reason: item.reason,
        request:
          item.kind === active
            ? null
            : { kind: item.kind, direction: "from-source" },
      });
    if (!options.has(active))
      options.set(active, {
        label: formatLabel(active, entry),
        available: true,
        request: null,
      });
    return options;
  }
  function chooseFormat(kind) {
    const item = formatOptions().get(kind);
    if (pending || session || !item || item.available === false) return;
    selectedRepresentation = kind;
    conversionRequest = item.request;
    resetPreview();
    error.textContent = "";
    showStatus(text.ready);
    render();
    [...tablist.children].find((tab) => tab.dataset.kind === kind)?.focus();
  }
  function render() {
    if (disposed) return;
    const focusedTab = tablist.contains(doc.activeElement)
      ? doc.activeElement.dataset.kind
      : null;
    const listed = entries(),
      entry = listed.find((item) => same(item.reference, selected)),
      availability = inspect(),
      active = entry?.activeRepresentation || "source";
    optionReferences = new Map(
      listed.map((item) => [key(item.reference), item.reference]),
    );
    const placeholder = doc.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.textContent = text.selectOne;
    selection.replaceChildren(
      placeholder,
      ...listed.map((item) => {
        const option = doc.createElement("option");
        option.value = key(item.reference);
        option.textContent = `${item.filename} (${item.reference.providerId} / ${item.reference.documentId})`;
        if (item.reason) option.title = item.reason;
        return option;
      }),
    );
    selection.value =
      selected && optionReferences.has(key(selected)) ? key(selected) : "";
    selectionRow.hidden = listed.length < 2;
    selection.disabled = pending || hasWork();
    switchHint.hidden = !hasWork() || listed.length < 2;
    sourceName.textContent = snapshot?.sourceName || entry?.filename || "";
    formatNote.textContent = entry?.format
      ? `(${text.format}: ${entry.format.toUpperCase()})`
      : "";
    formatNote.hidden = !entry?.format;
    schemaNote.textContent = `Schema: ${entry?.schema?.id || text.noSchema}`;

    let docsURL = null;
    try {
      if (entry?.docsURL && new URL(entry.docsURL).protocol === "https:")
        docsURL = entry.docsURL;
    } catch {
      /* Invalid metadata cannot create a navigation target. */
    }
    docsLink.hidden = !docsURL;
    if (docsURL) docsLink.href = docsURL;
    else docsLink.removeAttribute("href");
    editButton.disabled =
      pending ||
      !availability.available ||
      !bridge ||
      active !== "source" ||
      Boolean(conversionRequest);
    closeButton.disabled = commitLocked;
    cancelButton.disabled = commitLocked;
    saveButton.disabled =
      pending ||
      !availability.available ||
      (!hasWork() && Boolean(error.textContent)) ||
      !displayedPreviewMatches();
    representationOptions = formatOptions(entry);
    if (!selectedRepresentation) selectedRepresentation = active;
    const selectedOption = representationOptions.get(selectedRepresentation);
    if (
      !converting &&
      selectedRepresentation !== active &&
      (!selectedOption || selectedOption.available === false)
    ) {
      selectedRepresentation = active;
      conversionRequest = null;
      showError(new Error(text.conversionUnavailable));
      return render();
    }
    conversionRequest =
      selectedRepresentation === active
        ? null
        : selectedOption?.request || null;
    tablist.replaceChildren(
      ...[...representationOptions].map(([kind, item], index) => {
        const tab = button(`${kind === active ? "💽 " : ""}${item.label}`);
        tab.id = `twpe-yaml-format-${index}`;
        tab.dataset.kind = kind;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", panel.id);
        tab.setAttribute(
          "aria-selected",
          String(kind === selectedRepresentation),
        );
        tab.tabIndex = kind === selectedRepresentation ? 0 : -1;
        tab.disabled =
          pending ||
          !availability.available ||
          item.available === false ||
          (Boolean(session) && kind !== active);
        if (item.reason) tab.title = item.reason;
        return tab;
      }),
    );
    const selectedTab = [...tablist.children].find(
      (tab) => tab.dataset.kind === selectedRepresentation,
    );
    if (selectedTab) panel.setAttribute("aria-labelledby", selectedTab.id);
    if (focusedTab)
      [...tablist.children]
        .find((tab) => tab.dataset.kind === focusedTab && !tab.disabled)
        ?.focus();
    activeNote.textContent = text.active;
    representationHint.hidden = true;
    externalHint.hidden = !session;
    previewLabel.textContent = draft !== null ? text.draft : text.preview;
    previewLabel.hidden = selectedRepresentation !== "source";
    preview.hidden = selectedRepresentation !== "source";
    blockPreview.hidden = selectedRepresentation === "source";
    previewLoading.hidden = !previewPending;
    editButton.disabled ||= selectedRepresentation !== "source";
    if (replacementNotice) showStatus(text.replaced);
    else if (adapter && !availability.available && !pending && !converting)
      status.textContent = `${text.unavailable}${availability.reason ? ` ${availability.reason}` : ""}`;
    else if (status.textContent !== actionStatus)
      status.textContent = actionStatus;
    status.hidden = !status.textContent;
    hatEntry?.refresh();
    if (adapter && snapshot && !pending && !samePreviewAttempt())
      void loadPreview();
  }
  async function request(route, options = {}) {
    const response = await fetcher(`/__twpe_yaml${route}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(bridge?.token ? { "X-TWPE-Yaml-Token": bridge.token } : {}),
        ...options.headers,
      },
    });
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error(text.localOnly);
    }
    if (!response.ok) {
      const cause = new Error(value.error || text.failed);
      cause.code = value.code;
      throw cause;
    }
    return value;
  }
  function endSession(id) {
    if (id && bridge)
      request(`/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
  }
  function capture() {
    if (!adapter) throw new Error(text.unavailable);
    snapshot = adapter.capture();
    if (typeof snapshot?.source !== "string")
      throw new Error("The document owner did not supply source text.");
    draft = null;
    resetPreview();
    preview.value = "";
    replacementNotice = false;
    selectedRepresentation = metadata()?.activeRepresentation || "source";
  }
  function clearWork() {
    epoch++;
    resetPreview();
    pending = false;
    commitLocked = false;
    converting = false;
    if (confirmation.open) confirmation.close();
    confirmRequested = null;
    selectedRepresentation = null;
    endSession(session?.id);
    session = null;
    draft = null;
    conversionRequest = null;
    snapshot = null;
    adapter?.dispose();
    adapter = null;
    selected = null;
    preview.value = "";
  }
  function closeDialog() {
    if (dialog.open) {
      ignoredCloseEvents++;
      dialog.close();
    }
  }
  function restoreFocus() {
    if (opener?.isConnected) opener.focus();
  }
  function cancelWork() {
    if (commitLocked || disposed) return;
    clearWork();
    error.textContent = "";
    replacementNotice = false;
    showStatus(text.ready);
    render();
    closeDialog();
    restoreFocus();
  }
  function finishSaved() {
    clearWork();
    error.textContent = "";
    replacementNotice = false;
    showStatus(text.saved);
    render();
    closeDialog();
    restoreFocus();
  }
  function invalidate() {
    if (disposed || converting) return;
    const editing = Boolean(snapshot || session || conversionRequest);
    clearWork();
    if (editing) replacementNotice = true;
    error.textContent = "";
    showStatus(replacementNotice ? text.replaced : text.ready);
    render();
  }
  async function operate(operation, failure = text.failed) {
    if (pending || disposed || !adapter) return;
    const generation = epoch,
      owner = adapter;
    pending = true;
    error.textContent = "";
    render();
    try {
      await operation(generation, owner);
    } catch (cause) {
      if (current(generation, owner)) {
        showStatus(failure);
        showError(cause, failure);
      }
    } finally {
      if (current(generation, owner)) {
        pending = false;
        commitLocked = false;
        render();
      }
    }
  }
  async function activate(reference) {
    if (disposed || pending || hasWork()) return;
    let next;
    try {
      next = createEmbeddedYamlDocument(vm, reference, registry);
      const state = next.inspect();
      if (!state.available) throw new Error(state.reason || text.unavailable);
    } catch (cause) {
      next?.dispose();
      showError(cause);
      render();
      return;
    }
    clearWork();
    adapter = next;
    selected = reference;
    try {
      capture();
      showStatus(text.ready);
    } catch (cause) {
      showError(cause);
    }
    render();
  }
  async function openFromHat(anchor) {
    if (disposed || pending || dialog.open) return;
    opener = anchor.element;
    error.textContent = "";
    dialog.showModal();
    if (anchor.error) {
      showError(anchor.error);
      return;
    }
    // Cancelling a dialog ends its private work. A new opening always captures live Editor state.
    await activate(anchor.reference);
  }
  closeButton.addEventListener("click", cancelWork);
  cancelButton.addEventListener("click", cancelWork);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!commitLocked) cancelWork();
  });
  dialog.addEventListener("close", () => {
    if (ignoredCloseEvents) {
      ignoredCloseEvents--;
      return;
    }
    if (converting) return;
    if (!disposed) {
      clearWork();
      render();
      restoreFocus();
    }
  });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("keyup", (event) => event.stopPropagation());
  selection.addEventListener("change", () => {
    const reference = optionReferences.get(selection.value);
    if (reference) void activate(reference);
  });
  editButton.addEventListener("click", () =>
    operate(async (generation, owner) => {
      if (session) {
        showStatus(text.starting);
        await request(`/sessions/${encodeURIComponent(session.id)}`, {method: "POST"});
        if (current(generation, owner)) showStatus(text.editing);
        return;
      }
      capture();
      showStatus(text.starting);
      const entry = metadata(),
        sourceName = snapshot.sourceName || entry?.filename;
      const created = await request("/sessions", {
        method: "POST",
        body: JSON.stringify({
          source: snapshot.source,
          sourceName,
          ...(entry?.format ? { format: entry.format } : {}),
          ...(entry?.schema ? { schema: entry.schema } : {}),
        }),
      });
      if (!current(generation, owner)) {
        endSession(created.id);
        return;
      }
      session = created;
      showStatus(text.editing);
    }),
  );
  async function readWorkcopy(generation, owner) {
    const saved = await request(`/sessions/${encodeURIComponent(session.id)}`);
    if (!current(generation, owner)) return null;
    if (typeof saved.source !== "string") throw new Error(text.failed);
    if (
      new TextEncoder().encode(saved.source).byteLength >
      Math.min(bridge.maxSourceBytes || 4194304, 4194304)
    )
      throw new Error(text.tooLarge);
    draft = saved.source;
    previewGeneration++;
    previewAttempt = { owner, snapshot, kind: "source" };
    previewPending = false;
    previewReady = { owner, snapshot, kind: "source", source: draft };
    preview.value = draft;
    if (typeof saved.revision === "number") session.revision = saved.revision;
    return saved.source;
  }
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest("[role=tab]");
    if (tab && !tab.disabled) chooseFormat(tab.dataset.kind);
  });
  tablist.addEventListener("keydown", (event) => {
    const tab = event.target.closest("[role=tab]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    const tabs = [...tablist.children].filter((item) => !item.disabled),
      index = tabs.indexOf(tab);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    chooseFormat(tabs[next].dataset.kind);
  });
  function dismissConfirmation() {
    confirmRequested = null;
    if (confirmation.open) confirmation.close();
    saveButton.focus();
  }
  confirmationCancel.addEventListener("click", dismissConfirmation);
  confirmation.addEventListener("cancel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dismissConfirmation();
  });
  confirmation.addEventListener("keydown", (event) => event.stopPropagation());
  confirmation.addEventListener("keyup", (event) => event.stopPropagation());
  confirmationOK.addEventListener("click", () => {
    const requested = confirmRequested;
    confirmRequested = null;
    confirmation.close();
    if (
      requested &&
      requested.epoch === epoch &&
      selectedRepresentation === requested.target
    )
      void saveRepresentation();
  });
  async function saveRepresentation() {
    if (pending || !conversionRequest || !adapter || !displayedPreviewMatches())
      return;
    const generation = epoch,
      owner = adapter,
      reference = selected,
      requested = { ...conversionRequest };
    let commitStarted = false;
    pending = true;
    error.textContent = "";
    showStatus(text.preparingConversion);
    render();
    if (!conversionRequest) {
      pending = false;
      render();
      return;
    }
    try {
      const prepared = await owner.prepareRepresentation(snapshot, requested);
      if (!current(generation, owner)) return;
      const capability = formatOptions().get(selectedRepresentation);
      if (
        !conversionRequest ||
        !capability ||
        capability.available === false ||
        JSON.stringify(capability.request) !== JSON.stringify(requested)
      )
        throw new Error(text.conversionUnavailable);
      if (
        !prepared ||
        typeof prepared.summary !== "string" ||
        !prepared.summary
      )
        throw new Error("The owner did not provide a conversion summary.");
      commitStarted = true;
      commitLocked = true;
      converting = true;
      showStatus(text.saving);
      render();
      closeDialog();
      await owner.commitRepresentation(snapshot, prepared);
      if (!current(generation, owner)) return;
      try {
        focusDocumentReference({ vm, registry, readReference, reference });
      } catch {
        /* Focus is a visual improvement, not part of the owner transaction. */
      }
      finishSaved();
    } catch (cause) {
      if (!disposed && epoch === generation) {
        if (commitStarted) {
          // A failed load may consume its candidate and roll back to a fresh project.
          conversionRequest = null;
          try {
            const next = createEmbeddedYamlDocument(vm, reference, registry);
            owner.dispose();
            adapter = next;
            selected = reference;
            capture();
            if (cause?.rollbackSucceeded === true) {
              conversionRequest = { ...requested };
              selectedRepresentation =
                requested.direction === "to-source" ? "source" : requested.kind;
            }
          } catch {
            /* Preserve the last preview when the owner cannot be resolved. */
          }
        }
        showStatus(text.saveFailed);
        showError(cause, text.saveFailed);
      }
    } finally {
      if (!disposed && epoch === generation) {
        converting = false;
        pending = false;
        commitLocked = false;
        render();
        if (!dialog.open) dialog.showModal();
        if (error.textContent) error.focus();
      }
    }
  }
  saveButton.addEventListener("click", () => {
    if (conversionRequest) {
      if (pending || confirmation.open || !displayedPreviewMatches()) return;
      const target = formatOptions().get(selectedRepresentation);
      if (!target || target.available === false) {
        render();
        return;
      }
      confirmRequested = { epoch, target: selectedRepresentation };
      confirmationMessage.textContent = text.confirmConversion(
        formatLabel(selectedRepresentation),
      );
      confirmation.showModal();
      confirmationCancel.focus();
      return;
    }
    if (!session) {
      if (!displayedPreviewMatches()) return;
      void operate(async (generation, owner) => {
        const active = metadata()?.activeRepresentation || "source";
        if (active === "source") {
          const prepared = await owner.prepare(snapshot, previewReady.source);
          if (!current(generation, owner)) return;
          commitLocked = true;
          render();
          await owner.commit(snapshot, prepared);
        } else {
          if (
            typeof owner.prepareRepresentation !== "function" ||
            typeof owner.commitRepresentation !== "function"
          )
            throw new Error(text.validationUnavailable);
          const prepared = await owner.prepareRepresentation(snapshot, {
            kind: active,
            direction: "from-source",
          });
          if (!current(generation, owner)) return;
          commitLocked = true;
          converting = true;
          render();
          closeDialog();
          try {
            await owner.commitRepresentation(snapshot, prepared);
          } catch (cause) {
            if (current(generation, owner) && !dialog.open) dialog.showModal();
            throw cause;
          } finally {
            converting = false;
          }
        }
        if (current(generation, owner)) finishSaved();
      }, text.saveFailed);
      return;
    }
    void operate(async (generation, owner) => {
      showStatus(text.saving);
      const source = await readWorkcopy(generation, owner);
      if (!current(generation, owner) || source === null) return;
      const prepared = await owner.prepare(snapshot, source);
      if (!current(generation, owner)) return;
      commitLocked = true;
      render();
      await owner.commit(snapshot, prepared);
      if (current(generation, owner)) finishSaved();
    }, text.saveFailed);
  });
  const refreshExternalPreview = () => {
    if (!session || pending || !dialog.open) return;
    void operate(async (generation, owner) => {
      await readWorkcopy(generation, owner);
    });
  };
  win.addEventListener("focus", refreshExternalPreview);
  const projectEvents = typeof vm.runtime?.on === "function" ? vm.runtime : vm;
  projectEvents.on?.("PROJECT_LOADED", invalidate);
  vm.runtime?.on?.("RUNTIME_DISPOSED", invalidate);
  const unsubscribe = registry.subscribe(render);
  showStatus(text.ready);
  render();
  hatEntry = attachEmbeddedYamlHat({
    vm,
    registry,
    readReference,
    window: win,
    getScratch: getScratch || (() => win.Scratch),
    label: text.open,
    canOpen: () => !disposed && !pending && !dialog.open,
    onOpen: openFromHat,
    onError: (cause) =>
      console.error("Could not attach the document hat icon.", cause),
  });
  const ready = request("/config")
    .then((config) => {
      if (disposed) return;
      if (config.available !== true || typeof config.token !== "string")
        throw new Error(text.localOnly);
      bridge = config;
      render();
    })
    .catch(() => {
      if (!disposed) render();
    });
  return {
    dialog,
    ready,
    refresh: () => {
      render();
      hatEntry.refresh();
    },
    getState: () => ({
      pending,
      commitLocked,
      reference: selected && { ...selected },
      session: session ? { id: session.id, revision: session.revision } : null,
      hasDraft: draft !== null,
      hasConversionRequest: Boolean(conversionRequest),
      selectedRepresentation,
      confirmationOpen: confirmation.open,
      previewPending,
      previewKind: displayedPreviewMatches() ? previewReady.kind : null,
      available: inspect().available,
    }),
    dispose() {
      if (disposed) return;
      clearWork();
      disposed = true;
      unsubscribe();
      win.removeEventListener("focus", refreshExternalPreview);
      projectEvents.off?.("PROJECT_LOADED", invalidate);
      vm.runtime?.off?.("RUNTIME_DISPOSED", invalidate);
      hatEntry.dispose();
      dialogWindow.dispose();
      confirmation.remove();
      dialog.remove();
    },
  };
}

export async function autostartYamlEditor({
  window: win = globalThis.window,
  timeoutMs = 30000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!win.vm) {
    if (Date.now() >= deadline)
      throw new Error("The Editor VM did not become available.");
    await new Promise((resolve) => win.setTimeout(resolve, 100));
  }
  if (typeof win.Scratch?.gui?.getBlockly === "function") {
    const { registerEmbeddedYamlRootHatShape } = await import("@kubohiroya/turbowarp-embedded-yaml");
    registerEmbeddedYamlRootHatShape(await win.Scratch.gui.getBlockly());
  }
  return mountYamlEditor({ vm: win.vm, document: win.document });
}
