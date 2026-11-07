import {attachPaletteCategoryReorder} from '@kubohiroya/turbowarp-plus-editor-ui/palette-category-reorder';
import {attachPaletteDropdownResize} from '@kubohiroya/turbowarp-plus-editor-ui/palette-dropdown-resize';
import styles from './palette.css';

const installed = new WeakSet();
const closeOnDragExit = new WeakMap();
const palettes = new Set<(horizontal: boolean) => void>();
let horizontalLayout = false;

export const setHorizontalBlockPalette = (horizontal: boolean) => {
    horizontalLayout = horizontal;
    for (const setMode of palettes) setMode(horizontal);
};

const attach = (ScratchBlocks, toolbox, {allowManualToggle, allowCategoryReorder}) => {
    const workspace = toolbox.workspace_;
    const flyout = toolbox.flyout_;
    const menu = toolbox.HtmlDiv;
    if (workspace.isMutator || toolbox.horizontalLayout_ || flyout.svgGroup_.tagName.toLowerCase() !== 'svg') return;

    const panel = flyout.svgGroup_;
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
        position: flyout.position
    };

    let horizontal = false;
    let openId = null;
    let layoutWidth;
    const scrollPositions = new Map();
    const verticalPosition = workspace.toolboxPosition;
    const categoryById = id => toolbox.categoryMenu_.categories_.find(category => category.id_ === id);

    const close = () => {
        if (openId === null) return;
        resizer.close();
        scrollPositions.set(openId, flyout.getScrollPos());
        categoryById(openId)?.item_.setAttribute('aria-expanded', 'false');
        openId = null;
        flyout.hide();
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
        showCategory(category, scrollPositions.get(category.id_) ?? 0);
    };

    const updateCategoryButtons = () => {
        for (const category of toolbox.categoryMenu_.categories_) {
            const item = category.item_;
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
    toolbox.getHeight = () => horizontal ? menu.offsetHeight : original.getHeight.call(toolbox);
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
    let categoryOrder: string[] = [];
    const applyCategoryOrder = () => {
        if (!categoryOrder.length) return;
        const current = categories();
        const rank = id => {
            const index = categoryOrder.indexOf(id);
            return index < 0 ? categoryOrder.length : index;
        };
        const ordered = current.slice().sort((a, b) => rank(a.id_) - rank(b.id_));
        if (ordered.every((category, index) => category === current[index])) return;
        current.splice(0, current.length, ...ordered);
        toolbox.categoryMenu_.table.append(...ordered.map(category => category.item_.parentElement));
    };
    const reorder = allowCategoryReorder && attachPaletteCategoryReorder(
        menu,
        () => categories().map(category => category.item_),
        (from, to) => {
            const ordered = categories().map(category => category.id_);
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
    toolbox.populate_ = tree => {
        if (reorder) reorder.cancel();
        original.populate.call(toolbox, tree);
        if (!horizontal) return;
        const category = categoryById(openId);
        if (category) toolbox.setSelectedItem(category, false);
        updateCategoryButtons();
    };

    const getBounds = () => {
        const surfaceRect = surface.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        return {
            surfaceLeft: surfaceRect.left,
            left: Math.max(0, menuRect.left - surfaceRect.left, -surfaceRect.left),
            right: Math.min(surface.clientWidth, menuRect.right - surfaceRect.left,
                doc.documentElement.clientWidth - surfaceRect.left),
            top: Math.max(menu.offsetHeight, -surfaceRect.top),
            bottom: Math.min(surface.clientHeight, doc.documentElement.clientHeight - surfaceRect.top) - 4
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
        const visible = width > flyout.SCROLLBAR_PADDING && height > 2 * flyout.SCROLLBAR_PADDING;
        panel.style.visibility = scrollbar.style.visibility = visible ? '' : 'hidden';
        if (!visible) {
            resizer.place(null);
            return;
        }

        const anchor = category.item_.getBoundingClientRect();
        const preferredLeft = resizer.left ?? (workspace.RTL ? anchor.right - width : anchor.left) - bounds.surfaceLeft;
        const left = Math.min(Math.max(bounds.left, preferredLeft), bounds.right - width);

        flyout.width_ = width;
        flyout.height_ = height;
        // Scratch Blocks positions RTL blocks against the width used when laying them out.
        if (flyout.RTL) flyout.workspace_.scrollX = width - layoutWidth;
        flyout.setBackgroundPath_(width, height);
        panel.setAttribute('width', width);
        panel.setAttribute('height', height);
        panel.style.transform = `translate(${left}px, ${top}px)`;
        flyout.scrollbar_.setOrigin(left, top);
        flyout.scrollbar_.resize();
        resizer.place({left, top, width, height});
        panel.style.opacity = '1';
    };

    const reposition = () => {
        if (openId !== null) flyout.position();
    };
    const resizeObserver = new win.ResizeObserver(reposition);
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
        if (clientX < left || clientX > right || clientY < top || clientY > bottom) close();
    });

    const setMode = next => {
        if (next === horizontal) return;
        if (reorder) reorder.cancel();
        const category = toolbox.getSelectedItem();
        workspace.cancelCurrentGesture();
        close();
        flyout.scrollTarget = null;
        horizontal = next;
        workspace.toolboxPosition = horizontal ? ScratchBlocks.TOOLBOX_AT_TOP : verticalPosition;
        menu.classList.toggle(styles.horizontal, horizontal);
        menu.toggleAttribute('data-horizontal-block-palette', horizontal);
        panel.classList.toggle(styles.panel, horizontal);
        scrollbar.classList.toggle(styles.scrollbar, horizontal);
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
        if (openId === category.id_) close();
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
    doc.addEventListener('pointerdown', event => {
        if (WidgetDiv.DIV?.contains(event.target)) return;
        WidgetDiv.hideIfOwner(toolbox);
        if (openId !== null && !resizer.contains(event.target) && ![menu, panel, scrollbar, DropDownDiv.DIV]
            .some(element => element?.contains(event.target))) close();
    }, capture);
    doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (WidgetDiv.owner_ === toolbox) WidgetDiv.hideIfOwner(toolbox);
        else if (!WidgetDiv.isVisible() && !DropDownDiv.isVisible()) close();
    }, capture);
    toolbox.dispose = () => {
        palettes.delete(setMode);
        closeOnDragExit.delete(flyout);
        resizeObserver.disconnect();
        resizer.dispose();
        if (reorder) reorder.dispose();
        events.abort();
        WidgetDiv.hideIfOwner(toolbox);
        original.dispose.call(toolbox);
    };
    palettes.add(setMode);
    setMode(horizontalLayout);
};

export const installHorizontalBlockPalette = (ScratchBlocks,
    {allowManualToggle = false, allowCategoryReorder = false} = {}) => {
    const toolbox = ScratchBlocks.Toolbox?.prototype;
    if (!toolbox?.init || installed.has(toolbox)) return;
    installed.add(toolbox);

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
