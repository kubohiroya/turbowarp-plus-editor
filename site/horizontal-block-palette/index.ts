import {attachPaletteCategoryReorder} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-category-reorder';
import {attachPaletteCategorySearch, matchPaletteBlocks, paletteSearchHeight} from
    '@kubohiroya/turbowarp-plus-editor-code-views/palette-category-search';
import {attachPaletteDropdownResize} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-dropdown-resize';
import {connectDetachedBlockPalette, openDetachedBlockPalette as openPaletteWindow, installGestureOwnerDocument, moveBlockWidgets} from
    '@kubohiroya/turbowarp-plus-editor-code-views/detached-block-palette';
import {attachPaletteMenuButton, createPaletteVisibilityStore, defaultVisibleGroups, extensionPaletteCatalog, filterToolboxTree,
    installExtensionPaletteGroups, paletteGroupSets, paletteScreenStateKey, paletteVisibilityMenuLabel, usedGroups} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-category-visibility';
import type {PaletteCategoryInfo, PaletteVisibilityStore} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-category-visibility';
import {openPaletteVisibilityDialog} from '@kubohiroya/turbowarp-plus-editor-code-views/palette-visibility-dialog';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import {attachPaletteCategoryGroups, filterGroupedToolboxTree, flattenCategoryGroups} from '../palette-category-groups/index.ts';
import styles from './palette.css';

const installed = new WeakSet();
const closeOnDragExit = new WeakMap();
const palettes = new Set<(horizontal: boolean) => void>();
let horizontalLayout = false;

// The VM whose editing target decides which block groups the palette shows.
type PaletteVM = {
    editingTarget?: any;
    runtime: {
        targets?: any[];
        _blockInfo?: PaletteCategoryInfo[];
        _fillExtensionCategory?(...args: any[]): unknown;
        getTargetForStage(): any;
        emitProjectChanged(): void;
        on(event: string, listener: (...args: any[]) => void): void;
        off(event: string, listener: (...args: any[]) => void): void;
    };
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    addSprite?(...args: any[]): Promise<unknown>;
    duplicateSprite?(targetId: string): Promise<unknown>;
};
/** The part of the editor's screen state the palette settings are saved with. */
type PaletteScreenState = {
    register(key: string, slice: {capture(): unknown}): () => void;
    whenLoaded(): Promise<{slices: Record<string, unknown>} | undefined>;
};
let paletteVM: PaletteVM | null = null;
let paletteStore: PaletteVisibilityStore | null = null;
const paletteRefreshers = new Set<() => void>();
// The palettes that can ask which groups a sprite just added shows; the latest one asks.
const newSpritePrompts: ((target: any) => void)[] = [];

// The groups the loaded extensions offer: one per extension, or one per group an extension declares.
// Group names are in the editor's language, where the palette and the settings screen show them.
const catalogOf = (vm: PaletteVM, locale?: string) => extensionPaletteCatalog(vm.runtime._blockInfo, locale);
const extensionIds = (vm: PaletteVM) => catalogOf(vm).groups.map(group => group.id);
const originalTargets = (vm: PaletteVM) => (vm.runtime.targets ?? []).filter(target => target.isOriginal);
const sameGroupSet = (left: ReadonlySet<string>, right: readonly string[]) =>
    left.size === right.length && right.every(group => left.has(group));
// Another sprite may share the same toolbox XML, in which case the GUI does not redraw the palette.
const refreshPalettes = () => setTimeout(() => {for (const update of paletteRefreshers) update();}, 0);

/**
 * Lets the palette show each sprite's and the stage's own block groups, and saves them with the editor's screen
 * state, as the tab layout is saved. Returns the function that stops it.
 */
export const connectPaletteVisibility = (vm: PaletteVM, getScreenState: () => PaletteScreenState | undefined = () => undefined) => {
    const store = createPaletteVisibilityStore({catalog: () => catalogOf(vm)});
    const removeExtensionGroups = installExtensionPaletteGroups(vm.runtime ?? {});
    paletteVM = vm;
    paletteStore = store;
    let unregister: (() => void) | undefined;
    const register = () => {
        if (unregister) return;
        unregister = getScreenState()?.register(paletteScreenStateKey, {capture: () => store.capture(originalTargets(vm))});
    };
    register();
    // A project opens with its own settings, or with every target at its default.
    const loaded = () => {
        register();
        store.reset();
        refreshPalettes();
        getScreenState()?.whenLoaded().then(state => {
            if (paletteStore !== store) return;
            const saved = state?.slices?.[paletteScreenStateKey];
            if (saved === undefined) return;
            store.apply(saved, originalTargets(vm));
            refreshPalettes();
        }, () => {});
    };
    const changed = () => {
        vm.runtime.emitProjectChanged();
        refreshPalettes();
    };
    // An extension added from the library shows all its groups in the sprite or stage being edited.
    const added = (info: {id?: string}) => {
        const target = vm.editingTarget;
        if (!target || !info?.id) return;
        const groups = store.visible(target, extensionIds(vm));
        const offered = catalogOf(vm).groups.filter(group => group.extensionId === info.id).map(group => group.id);
        if (offered.every(group => groups.has(group))) return;
        store.set(target, [...groups, ...offered.filter(group => !groups.has(group))], extensionIds(vm));
        changed();
    };
    // The VM tells a duplicate, a new sprite and a loaded one apart only by the method that made it, and each
    // makes the new sprite the editing target.
    const originalDuplicate = vm.duplicateSprite;
    const originalAddSprite = vm.addSprite;
    // A duplicated sprite starts with the groups of the sprite it was made from.
    if (typeof originalDuplicate === 'function') {
        vm.duplicateSprite = function (targetId: string) {
            const source = vm.runtime.targets?.find(target => target.id === targetId);
            return originalDuplicate.call(this, targetId).then(result => {
                const target = vm.editingTarget;
                if (paletteStore === store && source && target && target !== source) {
                    store.copy(source, target);
                    refreshPalettes();
                }
                return result;
            });
        };
    }
    // A sprite painted, chosen, uploaded or picked by surprise asks which groups it shows, when the project has
    // extension groups to choose from or another sprite shows groups other than its default, which it can copy.
    if (typeof originalAddSprite === 'function') {
        vm.addSprite = function (...args: unknown[]) {
            const before = vm.editingTarget;
            return originalAddSprite.apply(this, args).then(result => {
                const target = vm.editingTarget;
                if (paletteStore !== store || !target || target === before || target.isStage) return result;
                const ids = extensionIds(vm);
                const customized = originalTargets(vm).some(other => !other.isStage && other !== target &&
                    !sameGroupSet(store.visible(other, ids), defaultVisibleGroups(other, ids)));
                if (ids.length || customized) newSpritePrompts.at(-1)?.(target);
                return result;
            });
        };
    }
    // A host that passes a VM without events still gets the filtering; only the redraws are missing.
    const listens = typeof vm.on === 'function' && typeof vm.runtime?.on === 'function';
    if (listens) {
        vm.on('workspaceUpdate', refreshPalettes);
        vm.runtime.on('PROJECT_LOADED', loaded);
        vm.runtime.on('EXTENSION_ADDED', added);
    }
    return () => {
        if (listens) {
            vm.off('workspaceUpdate', refreshPalettes);
            vm.runtime.off('PROJECT_LOADED', loaded);
            vm.runtime.off('EXTENSION_ADDED', added);
        }
        if (vm.duplicateSprite !== originalDuplicate) vm.duplicateSprite = originalDuplicate;
        if (vm.addSprite !== originalAddSprite) vm.addSprite = originalAddSprite;
        unregister?.();
        removeExtensionGroups();
        if (paletteVM === vm) paletteVM = null;
        if (paletteStore === store) paletteStore = null;
    };
};

export const setHorizontalBlockPalette = (horizontal: boolean) => {
    horizontalLayout = horizontal;
    for (const setMode of palettes) setMode(horizontal);
};

export const openDetachedBlockPalette = options => {
    const workspace = window.ScratchBlocks?.getMainWorkspace();
    if (workspace) openPaletteWindow(workspace, options);
};

const attach = (ScratchBlocks, toolbox, {allowManualToggle, allowCategoryReorder}) => {
    const workspace = toolbox.workspace_;
    const flyout = toolbox.flyout_;
    const menu = toolbox.HtmlDiv;
    if (workspace.isMutator || toolbox.horizontalLayout_ || flyout.svgGroup_.tagName.toLowerCase() !== 'svg') return;

    const panel = flyout.svgGroup_;
    const body = flyout.workspace_.svgGroup_;
    const bodyTransform = body.getAttribute('transform');
    const scrollbar = flyout.scrollbar_.outerSvg_;
    const surface = workspace.getParentSvg();
    const doc = menu.ownerDocument;
    const win = doc.defaultView;
    const resizer = attachPaletteDropdownResize(panel, () => flyout.position());
    const {ContextMenu, WidgetDiv, DropDownDiv} = ScratchBlocks;
    const events = new AbortController();
    const capture = {capture: true, signal: events.signal};
    const original = {
        dispose: toolbox.dispose,
        getClientRect: toolbox.getClientRect,
        getHeight: toolbox.getHeight,
        getWidth: toolbox.getWidth,
        populate: toolbox.populate_,
        scrollToId: toolbox.scrollToCategoryById,
        scrollToName: toolbox.scrollToCategoryByName,
        showAll: toolbox.showAll_,
        getFlyoutWidth: flyout.getWidth,
        isDragTowardWorkspace: flyout.isDragTowardWorkspace,
        layout: flyout.layout_,
        position: flyout.position
    };

    let horizontal = false;
    let detached = false;
    let openId = null;
    let layoutWidth;
    let scrollBeforeSearch = 0;
    const scrollPositions = new Map();
    const verticalPosition = workspace.toolboxPosition;
    const categoryById = id => toolbox.categoryMenu_.categories_.find(category => category.id_ === id);
    const getLocale = () => ScratchBlocks.ScratchMsgs.currentLocale_ || doc.documentElement.lang;
    // A category nested in another opens from its group's child palette.
    const groups = attachPaletteCategoryGroups(menu, {
        categories: () => toolbox.categoryMenu_.categories_,
        horizontal: () => horizontal,
        rtl: workspace.RTL,
        choose: category => toolbox.setSelectedItem(category),
        onChange: () => updateCategoryButtons()
    });
    const search = attachPaletteCategorySearch(panel, getLocale, (query, previous) => {
        const category = categoryById(openId);
        if (!category) return;
        if (!previous) scrollBeforeSearch = flyout.getScrollPos();
        flyout.scrollTarget = null;
        showCategory(category, query ? 0 : scrollBeforeSearch);
    });

    const close = () => {
        if (openId === null) return;
        resizer.close();
        scrollPositions.set(openId, search.query ? scrollBeforeSearch : flyout.getScrollPos());
        search.close();
        categoryById(openId)?.item_.setAttribute('aria-expanded', 'false');
        openId = null;
        updateCategoryButtons();
        flyout.hide();
    };

    const closeIfUnpinned = () => {
        const pin = panel.querySelector(':scope > .sa-lock-object.locked');
        if (!pin || win.getComputedStyle(pin).display === 'none') close();
    };

    const showCategory = (category, scroll) => {
        const label = doc.createElement('label');
        label.setAttribute('text', category.name_);
        label.setAttribute('web-class', 'categoryLabel');
        label.setAttribute('showStatusButton', category.showStatusButton_);
        if (flyout.RTL) {
            layoutWidth = flyout.getWidth();
            flyout.workspace_.scrollX = 0;
        }
        flyout.show([label].concat(category.getContents()));
        flyout.setScrollPos(scroll);
    };

    flyout.layout_ = (contents, gaps) => {
        const category = categoryById(openId);
        if (!horizontal || !category || !search.query) {
            original.layout.call(flyout, contents, gaps);
            return;
        }
        const matching = matchPaletteBlocks(contents, category.name_, search.query, ScratchBlocks.utils.replaceMessageReferences,
            (block: {inputList: {fieldRow: {getText(): string}[]}[]}) => block.inputList.flatMap(input => input.fieldRow)
                .filter(field => field instanceof ScratchBlocks.FieldLabel)
                .map(field => field.getText()).join(' '));
        const kept = [];
        const keptGaps = [];
        for (let index = 0; index < contents.length; index++) {
            const item = contents[index];
            if (item.type === 'block' && !matching.has(item.block)) {
                item.block.dispose(false, false);
            } else {
                kept.push(item);
                keptGaps.push(gaps[index]);
            }
        }
        flyout.permanentlyDisabled_ = flyout.permanentlyDisabled_.filter(block => matching.has(block));
        if (!matching.size) {
            const label = doc.createElement('label');
            label.setAttribute('text', search.emptyLabel);
            kept.push({type: 'button', button: new ScratchBlocks.FlyoutButton(flyout.workspace_, workspace, label, true)});
            keptGaps.push(flyout.GAP_Y);
        }
        original.layout.call(flyout, kept, keptGaps);
    };

    const open = category => {
        if (!category) return;
        if (openId === category.id_) {
            flyout.position();
            return;
        }
        close();
        openId = category.id_;
        resizer.open(openId);
        toolbox.setSelectedItem(category, false);
        category.item_.setAttribute('aria-expanded', 'true');
        updateCategoryButtons();
        showCategory(category, scrollPositions.get(category.id_) ?? 0);
    };

    const updateCategoryButtons = () => {
        for (const category of toolbox.categoryMenu_.categories_) {
            const item = category.item_;
            // A group's icon opens its child palette, which keeps aria-expanded itself.
            if (groups.isGroup(category.id_)) {
                if (horizontal) item.tabIndex = 0;
                else item.removeAttribute('tabindex');
                item.setAttribute('role', 'button');
                // The group stays marked while one of its categories' blocks are shown.
                item.toggleAttribute('data-palette-group-shown', horizontal && openId !== null &&
                    openId !== category.id_ && groups.topLevelId(openId) === category.id_);
                continue;
            }
            if (horizontal) {
                item.tabIndex = 0;
                item.setAttribute('role', 'button');
                item.setAttribute('aria-expanded', String(openId === category.id_));
            } else {
                item.removeAttribute('tabindex');
                item.removeAttribute('role');
                item.removeAttribute('aria-expanded');
            }
        }
    };

    toolbox.getWidth = () => horizontal ? 0 : original.getWidth.call(toolbox);
    toolbox.getHeight = () => horizontal ? (detached ? 0 : menu.offsetHeight) : original.getHeight.call(toolbox);
    // The menu stays a drop-to-delete target even when the popover is closed.
    toolbox.getClientRect = () => {
        if (!horizontal) return original.getClientRect.call(toolbox);
        const {left, top, right, bottom, width, height} = menu.getBoundingClientRect();
        return {left, top, width, height, contains: ({x, y}) => x >= left && x <= right && y >= top && y <= bottom};
    };
    toolbox.scrollToCategoryById = id => {
        if (horizontal) open(categoryById(id));
        else original.scrollToId.call(toolbox, id);
    };
    toolbox.scrollToCategoryByName = name => {
        if (horizontal) open(toolbox.categoryMenu_.categories_.find(category => category.name_ === name));
        else original.scrollToName.call(toolbox, name);
    };
    const categories = () => {
        const {categories_, table} = toolbox.categoryMenu_;
        // Addons may split categories into separate lists.
        return categories_.every(category => category.item_.parentElement.parentElement === table) ? categories_ : [];
    };
    // The categories the menu shows: a group's members are moved with it, so only the group is ordered.
    const shownCategories = () => categories().filter(category => groups.topLevelId(category.id_) === category.id_);
    let categoryOrder: string[] = [];
    const applyCategoryOrder = () => {
        if (!categoryOrder.length) return;
        const current = categories();
        const rank = id => {
            const index = categoryOrder.indexOf(groups.topLevelId(id));
            return index < 0 ? categoryOrder.length : index;
        };
        const ordered = current.slice().sort((a, b) => rank(a.id_) - rank(b.id_));
        if (ordered.every((category, index) => category === current[index])) return;
        current.splice(0, current.length, ...ordered);
        toolbox.categoryMenu_.table.append(...ordered.map(category => category.item_.parentElement));
    };
    const reorder = allowCategoryReorder && attachPaletteCategoryReorder(
        menu,
        () => shownCategories().map(category => category.item_),
        (from, to) => {
            const ordered = shownCategories().map(category => category.id_);
            ordered.splice(to, 0, ordered.splice(from, 1)[0]);
            categoryOrder = ordered.concat(categoryOrder.filter(id => !ordered.includes(id)));
            applyCategoryOrder();
            if (horizontal) {
                resizer.followAnchor();
                flyout.position();
            } else {
                const selected = toolbox.getSelectedItem();
                original.showAll.call(toolbox);
                if (selected) original.scrollToId.call(toolbox, selected.id_);
            }
        }
    );

    toolbox.showAll_ = () => {
        applyCategoryOrder();
        if (!horizontal) {
            original.showAll.call(toolbox);
            return;
        }
        const category = categoryById(openId);
        if (category) showCategory(category, flyout.getScrollPos());
        else close();
    };
    // The toolbox as the GUI gave it, so the palette can be drawn again when a sprite's groups change.
    let lastTree: Element | null = null;
    const visibleNow = () => {
        const target = paletteVM?.editingTarget;
        return target && paletteStore ? paletteStore.visible(target, extensionIds(paletteVM)) : null;
    };
    const redraw = () => {
        if (lastTree) workspace.updateToolbox(lastTree.cloneNode(true));
    };
    paletteRefreshers.add(redraw);
    const openGroupSettings = (target = paletteVM?.editingTarget, newSprite = false) => {
        const vm = paletteVM;
        const store = paletteStore;
        if (!vm || !store || !target) return;
        const catalog = catalogOf(vm, getLocale());
        const ids = catalog.groups.map(group => group.id);
        openPaletteVisibilityDialog(doc, {
            locale: getLocale(),
            targetName: target.getName(),
            isStage: target.isStage,
            newSprite,
            // A second or later sprite can copy the groups one already made shows.
            copySources: newSprite ? originalTargets(vm).filter(other => !other.isStage && other !== target)
                .map(other => ({name: other.getName(), groups: [...store.visible(other, ids)]})) : undefined,
            initial: store.visible(target, ids),
            used: usedGroups(target, catalog),
            extensions: (vm.runtime._blockInfo ?? []).map(info => {
                const groups = catalog.groups.filter(group => group.extensionId === info.id);
                return {
                    id: info.id,
                    metadata: {name: info.name || info.id, banner: info.menuIconURI || info.blockIconURI},
                    groups: groups.some(group => group.declared) ?
                        groups.map(group => ({id: group.id, name: group.name, color: group.color1})) : undefined
                };
            }),
            sets: paletteGroupSets(getLocale(), store.sets()),
            onApply({groups, addedSets}) {
                store.addSets(addedSets);
                store.set(target, groups, ids);
                vm.runtime.emitProjectChanged();
                redraw();
            },
            onCancel() {}
        });
    };
    const askNewSprite = (target: any) => openGroupSettings(target, true);
    newSpritePrompts.push(askNewSprite);
    const openExtensionLibrary = () => {
        const button: HTMLElement | null = doc.querySelector(
            '[data-code-extension-button] button, [class*="gui_extension-button-container_"] button');
        button?.click();
    };
    const paletteMenu = attachPaletteMenuButton(menu, getLocale, locale => [
        {label: paletteVisibilityMenuLabel(locale), onSelect: () => openGroupSettings()},
        {label: /^ja(?:-|$)/i.test(locale) ? '機能拡張を追加' : 'Add Extension', separated: true, onSelect: openExtensionLibrary}
    ]);

    // The GUI selects an extension by its ID once it is added; an extension split into groups has its first shown group.
    const selectCategoryById = toolbox.setSelectedCategoryById;
    toolbox.setSelectedCategoryById = function (id: string) {
        const group = !categoryById(id) && paletteVM ? catalogOf(paletteVM).groups
            .find(item => item.extensionId === id && categoryById(item.id)) : undefined;
        return selectCategoryById.call(this, group ? group.id : id);
    };

    toolbox.populate_ = tree => {
        if (reorder) reorder.cancel();
        if (tree) {
            lastTree = tree.cloneNode(true) as Element;
            let found = flattenCategoryGroups(tree);
            const visible = visibleNow();
            if (visible) {
                found = filterGroupedToolboxTree(tree, found,
                    filtered => filterToolboxTree(filtered, visible, paletteVM ? catalogOf(paletteVM, getLocale()) : undefined));
            }
            original.populate.call(toolbox, tree);
            groups.update(found);
        } else {
            original.populate.call(toolbox, tree);
        }
        paletteMenu.update();
        if (!horizontal) return;
        const category = categoryById(openId);
        if (category) toolbox.setSelectedItem(category, false);
        updateCategoryButtons();
    };

    const getBounds = () => {
        const surfaceRect = surface.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const viewport = surface.ownerDocument.documentElement;
        return {
            surfaceLeft: surfaceRect.left,
            left: Math.max(0, menuRect.left - surfaceRect.left, -surfaceRect.left),
            right: Math.min(surface.clientWidth, menuRect.right - surfaceRect.left,
                viewport.clientWidth - surfaceRect.left),
            top: Math.max(menu.offsetHeight, -surfaceRect.top),
            bottom: Math.min(surface.clientHeight, viewport.clientHeight - surfaceRect.top) - 4
        };
    };
    const getWidth = ({left, right}) => {
        const width = resizer.size?.width ?? original.getFlyoutWidth.call(flyout);
        return Math.max(1, Math.min(width, right - left - 8));
    };
    flyout.getWidth = () => horizontal ? getWidth(getBounds()) : original.getFlyoutWidth.call(flyout);

    flyout.position = () => {
        if (!horizontal) {
            original.position.call(flyout);
            return;
        }
        const category = categoryById(openId);
        if (!category || !flyout.isVisible()) return;

        // Keep the existing vertical flyout and scrollbar. Only their viewport and origin change.
        const bounds = getBounds();
        const {top} = bounds;
        const width = getWidth(bounds);
        const requestedHeight = resizer.size?.height ?? Math.min(360, surface.clientHeight * 0.65);
        const height = Math.max(0, Math.min(requestedHeight, bounds.bottom - top));
        const bodyHeight = height - paletteSearchHeight;
        const visible = width > flyout.SCROLLBAR_PADDING && bodyHeight > 2 * flyout.SCROLLBAR_PADDING;
        panel.style.visibility = scrollbar.style.visibility = visible ? '' : 'hidden';
        if (!visible) {
            resizer.place(null);
            search.place(null);
            return;
        }

        // A category in a group is placed under the group's icon, since its own is hidden.
        const anchor = groups.anchorOf(category).getBoundingClientRect();
        const preferredLeft = resizer.left ?? (workspace.RTL ? anchor.right - width : anchor.left) - bounds.surfaceLeft;
        const left = Math.min(Math.max(bounds.left, preferredLeft), bounds.right - width);

        flyout.width_ = width;
        flyout.height_ = bodyHeight;
        // Scratch Blocks positions RTL blocks against the width used when laying them out.
        if (flyout.RTL) flyout.workspace_.scrollX = width - layoutWidth;
        flyout.setBackgroundPath_(width, height);
        panel.setAttribute('width', width);
        panel.setAttribute('height', height);
        panel.style.transform = `translate(${left}px, ${top}px)`;
        flyout.scrollbar_.setOrigin(left, top + paletteSearchHeight);
        flyout.scrollbar_.resize();
        resizer.place({left, top, width, height});
        search.place({left, top, width});
        panel.style.opacity = '1';
    };

    const reposition = () => {
        if (openId !== null) flyout.position();
    };
    const resizeObserver = new win.ResizeObserver(() => {
        syncInputDocument();
        reposition();
    });
    resizeObserver.observe(surface);
    resizeObserver.observe(menu);
    win.addEventListener('resize', reposition, {signal: events.signal});

    flyout.isDragTowardWorkspace = delta => {
        if (!horizontal) return original.isDragTowardWorkspace.call(flyout, delta);
        // Leave vertical swipes available to scroll the block list on touch screens.
        const touch = workspace.currentGesture_?.mostRecentEvent_?.type.startsWith('touch');
        return Math.abs(delta.x) > Math.abs(delta.y) / 2 || (!touch && delta.y > 0);
    };
    closeOnDragExit.set(flyout, ({clientX, clientY}) => {
        if (openId === null) return;
        const {left, right, top, bottom} = panel.getBoundingClientRect();
        if (clientX < left || clientX > right || clientY < top || clientY > bottom) closeIfUnpinned();
    });

    const setMode = next => {
        if (next === horizontal) return;
        if (reorder) reorder.cancel();
        const category = toolbox.getSelectedItem();
        workspace.cancelCurrentGesture();
        groups.close();
        close();
        flyout.scrollTarget = null;
        horizontal = next;
        workspace.toolboxPosition = horizontal ? ScratchBlocks.TOOLBOX_AT_TOP : verticalPosition;
        menu.classList.toggle(styles.horizontal, horizontal);
        menu.toggleAttribute('data-horizontal-block-palette', horizontal);
        panel.classList.toggle(styles.panel, horizontal);
        scrollbar.classList.toggle(styles.scrollbar, horizontal);
        if (horizontal) body.setAttribute('transform', `translate(0 ${paletteSearchHeight}) ${bodyTransform ?? ''}`);
        else if (bodyTransform === null) body.removeAttribute('transform');
        else body.setAttribute('transform', bodyTransform);
        updateCategoryButtons();
        if (horizontal) flyout.hide();
        else {
            panel.style.visibility = scrollbar.style.visibility = '';
            if (flyout.RTL) flyout.workspace_.scrollX = 0;
            toolbox.showAll_();
            if (category) toolbox.setSelectedItem(category);
        }
        workspace.resize();
    };

    const showContextMenu = event => {
        event.preventDefault();
        event.stopPropagation();
        const japanese = doc.documentElement.lang.toLowerCase().startsWith('ja');
        const text = horizontal ?
            (japanese ? 'パレットを縦表示にする' : 'Use vertical palette') :
            (japanese ? 'パレットを横表示にする' : 'Use horizontal palette');
        // The addon wrapper for ContextMenu.show expects an active Blockly gesture.
        const popup = ContextMenu.populate_([{
            text,
            twPlusMenuIcon: horizontal ? 'paletteVertical' : 'paletteHorizontal',
            enabled: true,
            callback: () => {
                WidgetDiv.hideIfOwner(toolbox);
                setMode(!horizontal);
            }
        }], workspace.RTL);
        WidgetDiv.show(toolbox, workspace.RTL, () => popup.dispose());
        ContextMenu.position_(popup, event, workspace.RTL);
    };
    if (allowManualToggle) {
        menu.addEventListener('contextmenu', showContextMenu, capture);
        panel.addEventListener('contextmenu', event => {
            // Keep each block's own context menu.
            if (event.target === panel || event.target === flyout.svgBackground_) showContextMenu(event);
        }, capture);
    }
    menu.addEventListener('mouseup', event => {
        if (allowManualToggle && (event.button === 2 || (event.button === 0 && event.ctrlKey))) event.stopPropagation();
    }, capture);
    menu.addEventListener('keydown', event => {
        if (!horizontal || !['Enter', ' '].includes(event.key)) return;
        const category = toolbox.categoryMenu_.categories_.find(item => item.item_ === event.target);
        if (!category) return;
        event.preventDefault();
        if (groups.isGroup(category.id_)) groups.toggle(category, true);
        else if (openId === category.id_) close();
        else open(category);
    }, capture);
    menu.addEventListener('scroll', () => {
        resizer.followAnchor();
        if (horizontal) flyout.position();
    }, {signal: events.signal});
    menu.addEventListener('wheel', event => {
        if (!horizontal || event.ctrlKey || event.deltaX || !event.deltaY || menu.scrollWidth <= menu.clientWidth) return;
        event.preventDefault();
        menu.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    }, {passive: false, signal: events.signal});
    const onPointerDown = event => {
        if (WidgetDiv.DIV?.contains(event.target)) return;
        WidgetDiv.hideIfOwner(toolbox);
        if (openId === null || groups.contains(event.target) || resizer.contains(event.target) || search.contains(event.target) || [menu, panel, scrollbar, DropDownDiv.DIV]
            .some(element => element?.contains(event.target))) return;
        closeIfUnpinned();
    };
    const onKeyDown = event => {
        if (event.key !== 'Escape' || event.isComposing || groups.isOpen()) return;
        if (WidgetDiv.owner_ === toolbox) WidgetDiv.hideIfOwner(toolbox);
        else if (!WidgetDiv.isVisible() && !DropDownDiv.isVisible()) close();
    };
    const onWorkspaceKeyDown = event => {
        if (surface.contains(event.target)) ScratchBlocks.onKeyDown_(event);
    };
    let inputDocument: Document;
    function syncInputDocument() {
        const current = surface.ownerDocument;
        if (current === inputDocument) return;
        if (inputDocument) workspace.cancelCurrentGesture();
        moveBlockWidgets(ScratchBlocks, current);
        inputDocument?.removeEventListener('pointerdown', onPointerDown, true);
        inputDocument?.removeEventListener('keydown', onKeyDown, true);
        inputDocument?.removeEventListener('keydown', onWorkspaceKeyDown);
        inputDocument = current;
        inputDocument.addEventListener('pointerdown', onPointerDown, capture);
        inputDocument.addEventListener('keydown', onKeyDown, capture);
        if (current !== doc) inputDocument.addEventListener('keydown', onWorkspaceKeyDown, {signal: events.signal});
    }
    syncInputDocument();
    const disconnectPalette = connectDetachedBlockPalette({
        blocks: ScratchBlocks, workspace, flyout, menu,
        categories: () => toolbox.categoryMenu_.categories_.map(({id_, name_, item_}) => ({
            id: id_,
            label: ScratchBlocks.utils.replaceMessageReferences(name_),
            color: item_.querySelector('.scratchCategoryItemBubble')?.style.backgroundColor,
            image: item_.querySelector('.scratchCategoryItemIcon')?.style.backgroundImage
        })),
        show(id) {
            const category = categoryById(id);
            if (category) showCategory(category, 0);
        },
        setDetached(value) {
            close();
            detached = value;
            for (const element of [menu, panel, scrollbar]) element.toggleAttribute('data-detached-palette-source', value);
            if (!value) flyout.hide();
            workspace.resize();
        }
    });
    toolbox.dispose = () => {
        paletteRefreshers.delete(redraw);
        newSpritePrompts.splice(newSpritePrompts.indexOf(askNewSprite) >>> 0, 1);
        paletteMenu.dispose();
        groups.dispose();
        disconnectPalette();
        if (inputDocument !== doc) moveBlockWidgets(ScratchBlocks, doc);
        palettes.delete(setMode);
        closeOnDragExit.delete(flyout);
        resizeObserver.disconnect();
        resizer.dispose();
        search.dispose();
        if (reorder) reorder.dispose();
        events.abort();
        WidgetDiv.hideIfOwner(toolbox);
        original.dispose.call(toolbox);
    };
    // Scratch Blocks drew the first toolbox before the palette was attached, dropping the categories nested in groups.
    const firstTree = workspace.options.languageTree;
    if (firstTree?.querySelector?.('category category')) toolbox.populate_(firstTree.cloneNode(true));
    palettes.add(setMode);
    setMode(horizontalLayout);
};

export const installHorizontalBlockPalette = (ScratchBlocks,
    {allowManualToggle = false, allowCategoryReorder = false} = {}) => {
    const toolbox = ScratchBlocks.Toolbox?.prototype;
    if (!toolbox?.init || installed.has(toolbox)) return;
    installed.add(toolbox);
    installGestureOwnerDocument(ScratchBlocks);

    const gesture = ScratchBlocks.Gesture.prototype;
    const {handleMove} = gesture;
    gesture.handleMove = function (...args) {
        const result = handleMove.apply(this, args);
        if (this.isDraggingBlock_ && this.mostRecentEvent_) {
            closeOnDragExit.get(this.flyout_)?.(this.mostRecentEvent_);
        }
        return result;
    };

    const {init} = toolbox;
    toolbox.init = function (...args) {
        const result = init.apply(this, args);
        attach(ScratchBlocks, this, {allowManualToggle, allowCategoryReorder});
        return result;
    };
};
