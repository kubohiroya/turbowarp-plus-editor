# TurboWarp-Plus-Editor

[日本語](README.ja.md)

[![TurboWarp-Plus-Editor](https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg)](https://kubohiroya.github.io/turbowarp-plus-editor/)

**[Open TurboWarp-Plus-Editor](https://kubohiroya.github.io/turbowarp-plus-editor/?lang=en)**

An editor for creating and opening TurboWarp Plus projects. It builds kubohiroya’s [scratch-gui fork](https://github.com/kubohiroya/scratch-gui) from a pinned revision and serves it through GitHub Pages. Japanese and English are supported.

- Site: <https://kubohiroya.github.io/turbowarp-plus-editor/>
- Editor: <https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en>
- npm: `@kubohiroya/turbowarp-plus-editor`

## Distribution responsibilities

`turbowarp-extension-data-editor` and `turbowarp-extension-security-dialog` are upstream libraries. `scratch-gui` consumes them, and this downstream package distributes and verifies the integrated Editor. The upstream libraries do not build the downstream GUI.

```text
turbowarp-extension-data-editor ───┐
                                 ├→ scratch-gui → turbowarp-plus-editor → GitHub Pages
turbowarp-extension-security-dialog┘
```

The GUI SHA, data-editor SHA, and security-dialog version are pinned in [`site/source.json`](site/source.json). The published `build-info.json` records the actual GUI, library, and site versions used together. The former data-editor Pages site is being retired; use this site as its replacement.

The landing page loads the shared `turbowarp-plus-site-header`. The Editor itself displays the GUI across the full screen.

## Opening projects

Choose **Edit in TurboWarp-Plus-Editor** on the landing page to open the Editor. Open a local SB3 file from the Editor’s **File** menu. To open a URL, provide an HTTPS SB3 file that allows browser fetching.

```text
https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en&project_url=https%3A%2F%2Fexample.com%2Fstory.sb3
```

URL-encode `project_url`. Both `lang=ja` and `lang=en` are supported. The edit button forwards the project URL and other Editor parameters supplied to the landing page.

<a id="edit-button"></a>
## “Edit in TurboWarp-Plus-Editor” button

The edit icon is a brand variant of the existing blue TurboWarp Plus base, drawn over with a blue pencil. Display the action label alongside the image and use a keyboard-focusable link. The shared CSS provides a minimum height of 56px, a 36px image, and a visible focus indicator.

Load the stylesheet once in the page’s `<head>`, then place the following link where you want the button:

```html
<link rel="stylesheet"
      href="https://kubohiroya.github.io/turbowarp-plus-editor/assets/edit-button.css">

<a class="twpe-edit-button"
   href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en&amp;project_url=https%3A%2F%2Fexample.com%2Fstory.sb3">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="36" height="36" alt="" aria-hidden="true">
  <span>Edit in TurboWarp-Plus-Editor</span>
</a>
```

Omit `project_url` to create a new project. For Japanese, use `lang=ja` and `TurboWarp-Plus-Editorで編集`.

The regular button shows the icon and action label. For a small button, add `twpe-edit-button--small`, use **Edit** as the visible text, and set both `title` and `aria-label` to **Edit in TurboWarp-Plus-Editor**. The Japanese equivalents are `編集` and `TurboWarp-Plus-Editorで編集`. The `title` supplies the hover tooltip.

```html
<a class="twpe-edit-button twpe-edit-button--small"
   href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en"
   title="Edit in TurboWarp-Plus-Editor" aria-label="Edit in TurboWarp-Plus-Editor">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="24" height="24" alt="" aria-hidden="true">
  <span>Edit</span>
</a>
```

Both sizes follow the OS color scheme by default (`auto`). Set `<html data-theme="light">` or `dark` to fix the theme; use `auto` or remove the attribute to restore automatic selection. To generate a button in code, use `renderEditButton({size: 'small', language: 'en', projectURL: 'https://example.com/story.sb3'})`. The default size is regular.

GitHub READMEs cannot apply external CSS. Use an image link instead:

```html
<a href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="36" height="36" alt=""> Edit in TurboWarp-Plus-Editor
</a>
```

The TurboWarp Plus extension catalog is available on ordinary Editor URLs. To use the legacy catalog path, reload with `twPlusExtensionLoader=0&twPlusExtensions=1`. Other GUI feature flags remain unchanged, and the button preserves supplied parameters.

The extension loader from Issue #4 consists of an independent loader core and thin GUI/VM adapters. In the regular distribution, the Embedded/Remote validation and permission UI is enabled on ordinary launch URLs without a feature flag (fixed at startup, on by default). The Packager action for Plus projects opens the local output screen and checks approval both when generating the output and on the recipient’s first run. Reload with `twPlusExtensionLoader=0` to disable it. Explicit `=1` remains supported; invalid values disable it. See the [integration specification](docs/extension-loader-integration.md) for configuration, validation, Desktop limitations, and rollback.

See the [Issue #11 authoring guide](docs/extension-authoring-ui.md) for bulk and individual Embedded/Remote settings in the extension catalog and for adding extensions from JS files or URLs. This UI is also on by default for ordinary launches; reload with `twPlusExtensionLoader=0` to restore the previous addition flow.

## Using the npm package

```sh
npm install @kubohiroya/turbowarp-plus-editor
```

```ts
import {createEditorURL, renderEditButton} from '@kubohiroya/turbowarp-plus-editor';

const url = createEditorURL({
    language: 'en',
    projectURL: 'https://example.com/story.sb3',
    parameters: {fps: 60}
});
const html = renderEditButton({language: 'en', projectURL: 'https://example.com/story.sb3'});
```

The package includes the brand SVG, button CSS, URL/HTML helpers, and pinned distribution metadata. It ships compiled JavaScript and TypeScript declarations. The large GUI output is built for Pages from the pins rather than included in npm. URL helpers reject project URLs outside HTTP(S) and unsupported languages.

## Development and deployment

Use Node.js 26. All maintained JavaScript sources, build scripts, configurations, and tests are authored in TypeScript (`.ts`, or `.cts` for CommonJS). Node.js runs development scripts directly with native type stripping. Browser modules are emitted as JavaScript with esbuild, and npm entry points and declarations are compiled into `dist/` with TypeScript.

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:package
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui \
TW_PLUS_PACKAGER_ROOT=/absolute/path/to/pinned/packager npm run build:pages
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui npm run test:e2e
```

`npm run build` produces the npm JavaScript and declarations; `npm pack` runs it automatically. `npm run build:test-driver` compiles the optional VSCode test extension before native VSCode checks.

Check out the GUI and Packager SHAs recorded in `site/source.json`. Install the GUI dependencies and prepare that upstream checkout with `node scripts/prepublish.mjs`. The build verifies the GUI SHA, installed data-editor SHA, and security-dialog version against the pins. Pages deploys from main after successful integration checks. Release tags must match the npm version.

This repository verifies the integrated Editor. Existing upstream unit tests and GUI feature flags are preserved. After verifying the new distribution, migrate references and stop the former data-editor Pages site without leaving a redirect deployment. To roll back, revert to the previous GUI pin and site changes, then redeploy the previous artifact. To undo the TypeScript migration, revert its changes and restore the previous JavaScript sources and package configuration.

## Editing embedded documents (0.2.0-rc.1)

This experimental feature tracks [Issue #3](https://github.com/kubohiroya/turbowarp-plus-editor/issues/3) and [shared-package Issue #6](https://github.com/kubohiroya/turbowarp-plus-editor/issues/6). It requires `twPlusYamlEditor=1` at Editor startup and is off by default. Install Visual Studio Code and Node.js, then open the Editor through the local companion process. The shared `@kubohiroya/turbowarp-document-editor` package owns the editing UI and external-editor bridge, and the scratch-gui fork embeds it directly. This distribution pins, builds, and serves the GUI. `@kubohiroya/turbowarp-document-data` owns source persistence, document references, and provider registration; the independent `@kubohiroya/turbowarp-document-source` package owns hats, YAML icons, and shared YAML blocks. Extensions register documents, and the shared UI delegates validation and document updates to their owners. The GUI handles standard SB3 file saving.

The Kamishibai provider lives in App `4.0.0-rc.79` and uses the App’s validation API and schema. The Editor’s browser code does not embed the App or its parser. Supported Kamishibai projects have the new independent roots and named documents. They can display and convert source YAML, shared YAML blocks, and script blocks, with compatibility for the former single embedded source. Migrate older `kamishibai` / `kamishibaiConfig` projects into a separate SB3 using the App’s `migrate-embedded-yaml` first. External-script menus and projects containing only compiled data are outside this feature’s scope.

Add the tools to a prepared Editor build and start it locally. A new `build:pages` build performs the same addition automatically.

```sh
npm ci --ignore-scripts
npm run build:yaml-tools -- /absolute/path/to/editor/build
npm run editor:yaml -- --site-dir /absolute/path/to/editor/build --data-dir /absolute/path/to/work-files
```

Shared packages are pinned to published release candidates. VSCode integration requires the local companion serving a built Editor. It can also be launched from npm:

```sh
npx --package=@kubohiroya/turbowarp-plus-editor@0.2.0-rc.1 turbowarp-plus-editor-yaml --site-dir /absolute/path/to/editor/build --data-dir /absolute/path/to/work-files
```

GitHub Pages supports document display, conversion, and validation. Launching VSCode is available when opening the local URL above.

The displayed local URL enables the startup-fixed `twPlusYamlEditor=1` flag. Its reader is `config/feature-flags.js` in the scratch-gui fork.

1. Open an SB3 containing an embedded document and select the file icon on its **Data source** hat. In the YAML text tab of the document dialog, choose **Edit in external editor**.
2. Edit the YAML and save it in VSCode.
3. Return to the Editor and choose **Convert, validate and save the displayed format** at the lower right. It reads the saved VSCode working copy, validates its format, asset references, and project identity, and applies the document and consistency metadata in the Editor.
4. Save the SB3 using the Editor’s standard **File** menu or **Save to your computer**. Saving in the document dialog does not download a file. Image and audio storage remains unchanged.

The hat is the entry point to embedded YAML. Its dropdown shows the filename, while the SB3 stores a provider ID and document ID reference rather than duplicating the script text in a block argument. IDs distinguish documents even when filenames match. Save or cancel the current dialog before switching documents. The owning provider handles retrieval, validation, and updates; the same mechanism works beyond Kamishibai. Supported SB3s contain hats added by the current App implementation. The Editor does not automatically inject unknown blocks or extension code into older hatless SB3s. When a provider registers conversion capabilities, the same dialog can convert between source files, shared YAML blocks, and schema-specific blocks.

Providers may attach `schema: {id, schema}` to each document. Local integration writes the owner’s schema and associations to the working directory without inserting configuration comments into the YAML. The first opening of a document with a schema downloads the official Red Hat YAML extension, `redhat.vscode-yaml@2.0.0`, into a private extensions directory. Existing VSCode settings and extensions remain unchanged. The initial download requires network access. Documents without schemas continue to use owner validation when importing.

VSCode completion and diagnostics use [Red Hat YAML schema associations](https://github.com/redhat-developer/vscode-yaml#associating-schemas). Kamishibai provides an authoring schema for raw scripts; import also checks App syntax, semantics, asset references, and runtime-data consistency.

The companion accepts only authenticated operations from its local Editor. VSCode receives dedicated working files and an isolated settings area, preserving existing windows, settings, and extensions. Saved working files remain after sessions close or the process stops. The web interface cannot specify executable commands or arbitrary local paths.

Invalid YAML and project switches do not overwrite the previous content. Drafts that could not be applied remain in VSCode’s working files. **X** and **Cancel** discard dialog candidates and close without changing the Editor or deleting working files. New script asset references must validate against the project’s existing asset set.

If a storage path exceeds macOS IPC path limits, only the VSCode settings area moves automatically into a short private directory; working files stay in place. The working area’s `host.json` records the actual locations.

To roll back, remove the flag and restart; restore the previous verified version if needed. Stopping the companion preserves working files.

Relevant checks:

```sh
npm run test:yaml
TWPE_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:yaml:browser
TWPE_YAML_SITE=/absolute/path/to/editor/build \
TWPE_YAML_FIXTURE=/absolute/path/to/tutorial-4.0.sb3 \
TWPE_YAML_EVIDENCE=/absolute/path/to/evidence \
TWPE_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:yaml:roundtrip
# The same environment variables support the non-Kamishibai two-document fixture.
node --test test/yaml-multi-document.browser.ts
```

Automated browser regressions inject only the native launcher and exercise the real GUI, VM, and SB3. Native VSCode checks use the test-only Extension Development Host in `test/vscode-edit-driver/`, saving working YAML through VSCode’s own document-editing and saving APIs. The normal companion does not require this driver.

### Source, shared YAML blocks, and schema-specific blocks

Source files, shared YAML blocks representing keys/arrays/values/comments, and schema-specific blocks such as Kamishibai scripts are three representations of the same document. Source is the reference for meaning and conversion, while block edits are retained in Editor state. Switching to another block representation applies the current edits to source before converting, within one save operation. Selecting a conversion target alone does not change the project. The initial tab is the currently stored representation; the label above the preview identifies it with 💽. Saving another tab asks for confirmation; **OK** validates, converts, and applies it to the Editor. **Cancel** returns to the dialog with the selection retained. **X** and **Cancel** perform the same cancellation. Regeneration from source is rejected when it would overwrite unapplied block edits.

Each tab previews its format: text for source, read-only ScratchBlocks for block representations. Viewing does not change the project. Preview blocks cannot be moved or edited, but scrolling and zooming are available. 💽 identifies the representation currently stored in the Editor, not a downloaded SB3 file.

Shared YAML blocks represent comments one line at a time and multiline strings as line and line-break-kind blocks, avoiding newline loss in standard text fields. Unedited source preserves line breaks, quotes, and comments. The owner and YAML library determine formatting for edited content. JSON does not allow comments.

- `turbowarp-yaml-json`: YAML/JSON parsing and serialization, source syntax, and schema validation.
- `turbowarp-document-data`: Source, schemas, document references, provider registration, and SB3 persistence.
- `turbowarp-structured-data`: Temporary projections from source into runtime values, without rewriting source.
- `turbowarp-document-source`: Shared hats and blocks, conversion candidates, and application contracts.
- Each App: DSL-specific validation, script-block conversion, and runtime-data regeneration.
- `turbowarp-document-editor`: Dialogs, external-editor integration, previews, and document-save operations.
- The scratch-gui fork: Shared UI mounting, VM/Blockly integration, and standard SB3 file saving.
- TurboWarp-Plus-Editor: GUI pinning, builds, and distribution.

Non-Kamishibai source documents support YAML and JSON while preserving existing HTML/Markdown APIs. YAML/JSON detection is also added to the lower-level `turbowarp-named-data` package. The limited schema interpretation for structured data remains a separate contract from complete JSON Schema document validation.

New document persistence, projections, and representation conversion are off by default. In App rc.79, `twPlusYamlEditor=1` enables Editor and provider document operations under the same startup condition. Owners supply each document’s conversion capabilities; unsupported extensions do not acquire conversion automatically. If an older block script has no stored original module YAML, conversion does not claim to restore the original file and its comments.

**View guide** opens the provider’s website in another tab. There is no separate validation button: **Convert, validate and save the displayed format** validates and applies the displayed format. VSCode actions are disabled while block edits await application to source. JSON source uses VSCode’s standard JSON support and schema associations.

## License and author

License: GPL-3.0-or-later. See the individual licenses and NOTICE files for the integrated GUI and bundled components.

Author: [Hiroya Kubo](https://github.com/kubohiroya)

## Block icon previews

[Open the App rc.77 preview sample](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=en&twPlusBlockPreview=1&twPlusYamlEditor=1&project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-plus-editor%2Fsamples%2Fblock-preview%2Fblock-preview-rc77.sb3) to open the stage’s **Code** tab automatically and show the first scene. Try the two scenes covering placement and movement/speech bubbles. An [interactive guide](https://kubohiroya.github.io/turbowarp-plus-editor/samples/block-preview/?lang=en) and [SB3 download](https://kubohiroya.github.io/turbowarp-plus-editor/samples/block-preview/block-preview-rc77.sb3) are also available. The authored YAML and SVG files in `site/samples/block-preview/` are the source of truth; `build:pages` regenerates the sample from the published App rc.77. The deployed `metadata.json` records source, runtime, and SB3 hashes, which the Pages artifact gate verifies.

[Open the Editor with previews enabled](https://kubohiroya.github.io/turbowarp-plus-editor/?lang=en&twPlusBlockPreview=1&twPlusYamlEditor=1). Previews are off by default and support projects with scene/action blocks in the App rc.79 editing runtime. Features include hover stills, scene playback, actor dragging, and live moveTo/Bubble playback. See the [usage guide](docs/block-icon-preview.md) for operations and existing-project compatibility.

## Local data-source migration candidate

Launching with `twPlusYamlEditor=1&twPlusDocumentSource=1` enables **File inside SB3** and **External URL** source choices for compatible document providers. Source location is separate from the YAML text, YAML blocks, and script-block representations. Document names and references are preserved. The generic label is **Data source**; the Kamishibai provider supplies its own script-data label.

After changing the source location, fetch and preview it, then save to apply the same validated candidate. Cancel leaves the project unchanged. External sources must use browser-accessible HTTPS URLs with CORS support. To edit or convert external content into blocks, first import it by switching to **File inside SB3** and saving. External sites are never written back to. The App fetches URL content again at runtime startup and does not silently fall back to stale cached data on failure.

The new flag is off by default. It is read in the scratch-gui fork’s `config/feature-flags.js` and the App’s `src/dsl4/document-source.ts`. To roll back, remove the new flag, restart, and use the original SB3. These dependencies identify migration candidates; updating published references or publishing new packages/repositories is separate work.

This candidate includes the preceding UI changes: preventing preview overlays, showing the stored format within the tab, a floating external-editor button, and guide/schema links.
