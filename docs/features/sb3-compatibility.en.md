# TurboWarp-Plus-Editor: SB3 compatibility and feature list

[日本語](sb3-compatibility.md)

**TurboWarp-Plus-Editor opens `.sb3` files saved by Scratch 3 and by standard TurboWarp alike.** Use "File" → "Open SB3 File…" for both. The same item also opens the older `.sb` and `.sb2` formats. You can edit and run both standard Scratch blocks and the TurboWarp-specific blocks included in the editor. Projects that use custom extensions open as long as the extensions can be fetched and the required permission to run them is granted. [Loading projects in TurboWarp](https://docs.turbowarp.org/scratch-accounts) · [TurboWarp-specific blocks](https://docs.turbowarp.org/blocks) · [Custom extensions](https://docs.turbowarp.org/development/extensions/introduction)

Each verdict describes **a normal Scratch 3 or standard TurboWarp SB3 right after it is opened in the public editor (GitHub Pages) of TurboWarp Plus Editor**. The project contains no Plus extensions or Plus-specific data, and the editor starts with its default settings. "Yes" means the feature works with ordinary project data, "No" means it does not work in that state, and "N/A" means the operation happens outside the editor. When extra extensions, data or startup settings are needed, or a feature only works in a development build, the last column says so.

Section numbers match the "page.section" numbers of the [feature guide](index.en.html) (revised for the public editor as of November 14, 2026). Page 12, "Develop projects on GitHub", is not in this list because it is mostly about working on GitHub. Where the public editor differs, or a feature is still in development, the table says so. [Feature guide revision, issue #181](https://github.com/kubohiroya/turbowarp-plus-editor/issues/181)

## 1. [Open projects and prepare extensions](open/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [1.1 Start a new project or open an SB3](open/index.en.html#start) | Yes | Yes | "File" → "Open SB3 File…". `.sb` and `.sb2` open but cannot be overwritten; use "Save As…" to make an `.sb3`. Projects with custom extensions must meet the fetch and run conditions. |
| [1.2 Follow the loading progress](open/index.en.html#loading) | Yes | Yes | While loading, shows the current step and the time and elapsed seconds of each completed step. |
| [1.3 Add extensions from the catalog](open/index.en.html#extensions) | Yes | Yes | "File" → "Extensions…" → "Add Extension" adds extensions from the Plus catalog. |
| [1.4 Review how extensions will run before opening a project](open/index.en.html#review) | Yes | Yes | For projects with custom extensions that need review, choose the source and how each runs (do not run, in the sandbox, without the sandbox) before opening. |
| [1.5 When an extension fails to load](open/index.en.html#retry) | Yes | Yes | When fetching a custom extension fails. Retrying is offered only for failures worth retrying. |
| [1.6 Read the diagnostics when a project will not open](open/index.en.html#project-diagnostics) | Yes | Yes | "Project Properties" → "Project Diagnostics…" shows the loading results. Details on extension sources, run permission and verification appear when the loader recorded them. |

## 2. [Screen layout and menus](screen/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [2.1 The menu bar](screen/index.en.html#menu-bar) | Yes | Yes | On the left: the logo, the project title, "File", "Edit" and the search field. On the right: "Git", "Open stage", record (🎥), "…" (debugger) and extension buttons. |
| [2.2 The TurboWarp Plus menu](screen/index.en.html#plus-menu) | Yes | Yes | From the logo: appearance, behavior, addons, advanced settings, GitHub connection settings, AI agent settings, and editor information. |
| [2.3 The File menu](screen/index.en.html#file-menu) | Yes | Yes | Creating and opening (SB3, project folder, repository), releases, saving and exporting, and project settings. |
| [2.4 The Edit menu and shortcuts](screen/index.en.html#edit-menu) | Yes | Yes | Restore, Undo, Redo, Cut, Copy, Paste, Find and Replace, Rearrange Code Blocks. |
| [2.5 Extension buttons and the debugger at the top right](screen/index.en.html#extension-controls) | No | No | Shown when a supported extension (unsandboxed) that registers buttons is loaded. The debugger is a TurboWarp feature. |
| [2.6 Choose between the Plus layout and the Scratch layout](screen/index.en.html#layout) | Yes | Yes | The public editor starts in the Plus layout with the sprite list pinned on the left. `twPlusStandardLayout=0` switches to the Scratch layout. |

## 3. [Edit sprites and the backdrop](sprites/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [3.1 Find and pin sprites in the sprite list](sprites/index.en.html#sprite-drawer) | Yes | Yes | Search by name in the Plus layout's list and drag the divider to change its width. When unpinned, the list opens from the left edge. |
| [3.2 Sprite tabs and the editor panel icons](sprites/index.en.html#sprite-tabs) | Yes | Yes | Plus layout. Switch with the sprite tabs at the top and the icons down the left edge of the editor panel (Code, Costumes, Sounds, Properties & Variables, Messages). The backdrop shows "Backdrops" instead of "Costumes". Opening the same sprite in several tabs gives numbered tabs such as "Cat(2)". |
| [3.3 Edit costumes and sounds](sprites/index.en.html#media-panes) | Yes | Yes | Select costumes and sounds in the project; each pane keeps its own selection. Sounds can be played. The height limit on the costume preview is in the local integration build. |
| [3.4 Edit properties, variables and lists](sprites/index.en.html#variable-pane) | Yes | Yes | Show, create, rename and delete variables and lists: the sprite's own for a sprite, project-wide ones for the backdrop. "Edit list" edits list items. Variables used by blocks cannot be deleted. |
| [3.5 Check who sends and receives messages](sprites/index.en.html#messages) | Yes | Yes | Lists what each sprite and the backdrop sends and receives; the backdrop also shows the project-wide relation diagram. Renaming applies to the whole project. |
| [3.6 Edit the backdrop](sprites/index.en.html#backdrop) | Yes | Yes | From the backdrop tile, edit the stage's code, backdrops and sounds. |

## 4. [Open the stage and run your project](stage/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [4.1 Open the stage from the menu bar](stage/index.en.html#stage-open) | Yes | Yes | "Open stage" in the menu bar opens it. The "▾" next to it (stage opening options) chooses a separate window, a tab or the drawer. |
| [4.2 Run your project from the drawer on the right edge](stage/index.en.html#stage-controls) | Yes | Yes | "Show in the drawer" opens the drawer on the right edge. Use the green flag, pause and stop to control the run. "Stage display" switches between hiding automatically and always showing, and the drawer state is restored per project. |
| [4.3 The stage display menu](stage/index.en.html#stage-menu) | Yes | Yes | The open stage's "Stage display" moves it to a separate window, a tab or the drawer, and turns on full screen. The items depend on where the stage is open. |
| [4.4 Move the stage into the workspace or a separate window](stage/index.en.html#dock) | Yes | Yes | From "Stage display", choose "Show in a tab" or "Show in a separate window". In a tab, the stage scales to the pane width. From a separate window, "Return to the editor" brings it back. |

## 5. [Split the workspace and open panels separately](workspace/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [5.1 Resize the work areas by dragging the dividers](workspace/index.en.html#splitter) | Yes | Yes | The adjustable dividers differ between the Plus layout and the Scratch layout. Ratios are saved in the browser. |
| [5.2 Split panels side by side or top and bottom](workspace/index.en.html#split-panes) | Yes | Yes | Available in the Plus layout. "Editor panel layout" splits panels side by side or top and bottom. |
| [5.3 Compare the same sprite's code in two panes](workspace/index.en.html#multi-edit-view) | Yes | Yes | On the web, each pane keeps its own position and zoom while editing the same project. Code editing in OS-level windows was checked on the macOS Desktop development build. |
| [5.4 Open an editing panel in a separate window](workspace/index.en.html#panel-popout) | Yes | Yes | "Editor panel layout" opens a panel in a separate browser window. |
| [5.5 Move the sprite list to a separate window](workspace/index.en.html#detached-panels) | Yes | Yes | "Undock sprite list" moves the list to a separate browser window; return it from the window's layout menu or with the button left in its original place. Moving it to an app window was checked on the macOS Desktop development build. |
| [5.6 Restore the layout the next time you open a project](workspace/index.en.html#workspace-restore) | Yes | Yes | Tab order, splits and selection are recorded per project in the same browser profile and restored when the project is reopened. The layout lives in the browser; the project is saved to the SB3 or the project folder. |

## 6. [Find, place and organize blocks](blocks/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [6.1 Place blocks from the horizontal palette](blocks/index.en.html#palette) | Yes | Yes | Plus layout. Place standard blocks and blocks from extensions that loaded. |
| [6.2 Search for blocks within a palette category](blocks/index.en.html#palette-search) | Yes | Yes | "Search blocks" in the horizontal palette filters within a category. |
| [6.3 Resize a category flyout](blocks/index.en.html#palette-size) | Yes | Yes | Each category flyout of the horizontal palette can be resized. |
| [6.4 Reorder the categories](blocks/index.en.html#palette-order) | Yes | Yes | The category order resets on reload. Context menus show action icons by default. |
| [6.5 Open the block palette in a separate window](blocks/index.en.html#palette-popout) | Yes | Yes | Opens the palette in a separate browser window and switches between horizontal and vertical arrangement. |
| [6.6 Delete blocks by dropping them on the palette](blocks/index.en.html#delete-preview) | Yes | Yes | Dragging a block from the code area over the palette shows a delete preview. |
| [6.7 Move around long code with the minimap and zoom](blocks/index.en.html#minimap) | Yes | Yes | Plus layout. Navigate with the minimap and adjust the zoom. |
| [6.8 Work with context menus](blocks/index.en.html#context-menu) | Yes | Yes | Context menus for blocks, the code area, sprites and assets show icons. |
| [6.9 Rearrange code and copy it to another sprite](blocks/index.en.html#arrange) | Yes | Yes | Switch the code layout view (Z or N layout view) and use "Edit" → "Rearrange Code Blocks". Put two sprites' code tabs side by side and drag blocks to copy them. |

## 7. [Search and replace across the project](search/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [7.1 Search the whole project](search/index.en.html#project-search) | Yes | Yes | Searches across all sprites and the stage. The search field and "Find and Replace" share one panel, opened with ⌘F (Ctrl+F on Windows) and ⇧⌘F (Ctrl+Shift+F on Windows). |
| [7.2 Choose what to search (including YAML in the project)](search/index.en.html#search-scope) | Yes | Yes | Choose block names, variables, messages, arguments, extension names, comments and asset names. "YAML text" only finds something when a supported extension's documents are present. |
| [7.3 Replace the selected match](search/index.en.html#replace) | Yes | Yes | Replaces one selected match at a time. "YAML text" results are checked in a preview and saved only if it passes validation. |

## 8. [Edit extension data and documents](documents/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [8.1 Edit block values in a form](documents/index.en.html#forms) | No | No | Works on blocks for which a loaded form-capable extension has registered a form. Standard blocks use the usual input fields. |
| [8.2 Choose between external YAML and documents and blocks in the project](documents/index.en.html#documents) | No | No | With a supported extension that registers documents and a target document, convert between the source text, generic YAML blocks and dedicated blocks the provider supports. External references need a fetchable HTTPS URL; editing in VS Code needs the local companion. |
| [8.3 Open YAML from the project in a tab next to the code](documents/index.en.html#yaml-tabs) | No | No | With a supported extension that registers documents and a target document, open it from a data source block in a Dockview tab next to the code. |
| [8.4 View or play assets before choosing them](documents/index.en.html#asset-preview) | No | No | Works with the public Kamishibai extension rc.87 and a project prepared for editing (an editing SB3 built from the YAML script) that contains its asset blocks. Asset previews are on unless `twPlusBlockPreview` is set; `=0` opens only the form. Ordinary costume and sound editing is in 3.3. |
| [8.5 Preview scenes and behavior before applying them](documents/index.en.html#runtime) | No | No | Works on blocks for which an extension has registered a preview. Checking scenes and behavior with the Kamishibai extension rc.87 needs a matching project prepared for editing and `twPlusBlockPreview=1`. |

## 9. [Reuse scripts and assets](reuse/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [9.1 Transfer scripts and the stage to another project](reuse/index.en.html#transfer) | Yes | Yes | There is no Backpack at the bottom of the Scratch editor. Transfer scripts as `.blocks3` or by copy and paste, the stage as `.stage3`, and whole sprites as `.sprite3`. Scripts that use extensions need the same extensions and permissions in the destination. Pasting between different sites depends on browser support and permissions. |
| [9.2 Add bundled assets as backdrops, costumes and sounds](reuse/index.en.html#bundle-assets) | No | No | Bundled assets are files stored separately in the project for extensions such as Kamishibai. In an SB3 that contains such a bundle, "Project Data…" → "Add Bundle Material to Project…" copies images and sounds into the project. The originals stay in the bundle. |

## 10. [Save and distribute](save/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [10.1 Choose between Save and Save as](save/index.en.html#save) | Yes | Yes | "Save As…" chooses the name, format and location. In browsers that can choose a location, "Save Project" then overwrites it. A download leaves nothing to overwrite. Unsaved changes add `*` to the project title and tabs. |
| [10.2 Restore a project from a restore point](save/index.en.html#restore-points) | Yes | Yes | A TurboWarp feature. Restores from restore points recorded in the browser at regular intervals. |
| [10.3 Record project information in the SB3](save/index.en.html#project-properties) | Yes | Yes | Records the title, description, author and contact in the SB3. Resaving in the standard editor may drop the Plus-specific information. |
| [10.4 Set the project URI to keep caches separate](save/index.en.html#project-uri) | Yes | Yes | Set an HTTPS URI in Project Properties and record it in the SB3. For extensions that keep a cache per project, later cache writes are kept separate under the new URI (the earlier cache is not deleted). |
| [10.5 Choose the storage format for extension code](save/index.en.html#storage) | Yes | Yes | When adding an extension from the Plus catalog (1.3), "Where it loads from" chooses one of four: HTTPS reference (cached or not), a file inside the SB3, or data inside the project JSON. For extensions already added, "Extensions…" changes the storage format. |
| [10.6 Choose the storage format for source data and assets](save/index.en.html#payload-formats) | Yes | Yes | "File" → "Project Data…" chooses the storage format of ordinary backdrops, costumes and sounds: an HTTPS reference (cached or not), a file inside the SB3, or data inside the project JSON. The HTTPS source must have the same content as the current asset. Source data such as YAML is listed when a supported provider and target document exist. |
| [10.7 Export a project as a single HTML file](save/index.en.html#packager) | Yes | Yes | "File" → "Export…" → "Package Project" produces a single HTML file with the standard TurboWarp Packager. For projects with Plus-format extensions, see "Single-HTML export paths" below. |

### Single-HTML export paths

"File" → "Export…" → "Package Project" opens a different export screen depending on whether the project has Plus extension storage information (a manifest).

| Export path | Ordinary Scratch 3 SB3 | Ordinary TurboWarp SB3 | Project with Plus-format extensions |
| --- | --- | --- | --- |
| Standard TurboWarp Packager | Single HTML | Single HTML | The editor's menu leads to the Plus-only export screen |
| Plus-only export | N/A | N/A | Single HTML. Fetches and verifies extension code, bundles it, and keeps the sandbox settings |

Dependencies on external APIs, or on images and models an extension fetches while running, remain even in a single HTML file. [Standard Packager](https://docs.turbowarp.org/packager) · [Plus extension loader and HTML export](https://github.com/kubohiroya/turbowarp-plus-editor/blob/main/docs/extension-loader-integration.md)

## 11. [Manage projects with project folders and Git](git/index.en.html)

| Guide section | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| [11.1 Manage projects and extensions with sb3-toolchain](git/index.en.html#sb3-toolchain) | N/A | N/A | Both formats can be unpacked, checked and rebuilt with the Node.js command-line tool `sb3-toolchain`. See "sb3-toolchain in detail" below for each feature's conditions. |
| [11.2 Open and save a project folder](git/index.en.html#project-folder) | Yes | Yes | For project folders unpacked with sb3-toolchain v1. Needs a Chromium-based browser with File System Access. From a new project or an SB3, create a project folder with "Create Project Folder" in the "Project folder" panel or the "Project folder" format in "Save As…". Adding and deleting sprites, costumes and sounds also updates `assets/` and `sb3-source.json`. Embedded extensions and custom extensions loaded from a URL can be opened and saved; their code is written back to `extensions/` and `embedded-extensions.json`. Custom font references and files are saved too. |
| [11.3 Check changes and history with local Git](git/index.en.html#local-git) | Yes | Yes | For a repository with `.git` and project folders inside it. Needs a Chromium-based browser. Fetch, pull and push work against a GitHub HTTPS remote `origin` in environments with a configured connection. |
| [11.4 Compare project changes as blocks](git/index.en.html#block-diff) | Yes | Yes | Diffs of projects unpacked with sb3-toolchain v1. Blocks from unregistered extensions are shown as placeholder blocks. |
| [11.5 Sync with GitHub (fetch, pull, push)](git/index.en.html#github-sync) | Yes | Yes | In repositories with a GitHub HTTPS remote `origin`, in environments with a configured connection. Push needs explicit permission when connecting. |
| [11.6 Review pull requests script by script](git/index.en.html#pull-request-review) | Yes | Yes | Reads PRs of public repositories in a working folder whose `origin` is GitHub. Public API rate limits apply. |

### sb3-toolchain in detail

`sb3-toolchain` is a Node.js command-line tool. Use it to unpack and manage local SB3 files and to build SB3 files for distribution.

| sb3-toolchain feature | Scratch 3 SB3 | TurboWarp SB3 | Conditions and scope |
| --- | --- | --- | --- |
| Unpack an SB3 | Yes | Yes | `import` unpacks project data and assets. Supported embedded extensions can also be extracted into separate files. |
| Review diffs in Git | Yes | Yes | Manage the unpacked `project.source.json`, assets and extension code with Git. The editor's Local Git panel ("Git ▾" → "Open Local Git" in the menu bar) also shows diffs and history. |
| Check the unpacked source | Yes | Yes | `check` verifies asset references, MD5 and so on, and the mapping of embedded extensions if any. |
| Rebuild the SB3 | Yes | Yes | `build` rebuilds it. The same unpacked source and settings produce a byte-identical SB3. |
| Add assets, tidy block positions | Yes | Yes | Build settings can add sprites, backdrops, costumes and sounds. Tidying script positions is optional. |
| Manage sources, versions and hashes of embedded extensions | N/A | Yes, with a supported embedded extension | Pins a GitHub commit or an installed npm package version and checks SHA-256. |
| Check API compatibility when updating extensions | N/A | Yes, with a supported manifest | Compares API manifests before and after an update and checks for changes to blocks, arguments and so on. |
| Bundle and unbundle extensions | N/A | Yes, with a supported embedded extension | Several extensions can share one run-permission unit in the built SB3. The unpacked source keeps them separate; unbundling from a built SB3 alone needs a recovery capsule. |

Run permission is handled by the editor when the built SB3 is opened. Extensions that meet the catalog's trust conditions skip individual approval, and a bundle that needs review is shown as one unit. See [1.4 Review how extensions will run before opening a project](open/index.en.html#review).

[Using sb3-toolchain](https://github.com/kubohiroya/sb3-toolchain/blob/main/README.md) · [Extension API compatibility checks](https://github.com/kubohiroya/sb3-toolchain/blob/main/docs/extension-api-compatibility.md) · [Bundling and unbundling](https://github.com/kubohiroya/sb3-toolchain/blob/main/docs/extension-bundles.md) · [Editing project folders](https://github.com/kubohiroya/turbowarp-plus-editor/issues/305) · [Local Git panel](https://github.com/kubohiroya/turbowarp-plus-editor/pull/313)

## Runtime environment and scope of testing

Even when an `.sb3` opens, cloud variable servers, external APIs, external assets, and device and browser permissions depend on where the project runs. TurboWarp's cloud variable server is separate from Scratch's. Projects that use TurboWarp-only blocks or custom extensions have compatibility limits when moved back to Scratch. [Cloud variables](https://docs.turbowarp.org/cloud-variables) · [TurboWarp-specific blocks](https://docs.turbowarp.org/blocks) · [Custom extensions](https://docs.turbowarp.org/development/extensions/introduction)

On the VM of the local integration build, we tested an SB3 with Scratch's standard addition block and an SB3 with TurboWarp's "last key pressed" block. Both loaded, ran their blocks, and saved back to SB3. This is a VM test on two generated files; it does not cover real projects with custom extensions or each of the 59 features individually.
