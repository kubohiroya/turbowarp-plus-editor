import styles from './palette.css';

const installed = new WeakSet();
const closeOnDragExit = new WeakMap();
const palettes = new Set();
let horizontalLayout = false;

export const setHorizontalBlockPalette = horizontal => {
    horizontalLayout = horizontal;
    for (const setMode of palettes) setMode(horizontal);
};

const attach = (ScratchBlocks, toolbox, allowManualToggle) => {
    const workspace = toolbox.workspace_;
    const flyout = toolbox.flyout_;
    const menu = toolbox.HtmlDiv;
    if (workspace.isMutator || toolbox.horizontalLayout_ || flyout.svgGroup_.tagName.toLowerCase() !== 'svg') return;

    const panel = flyout.svgGroup_;
    const scrollbar = flyout.scrollbar_.svgGroup_;
    const surface = workspace.getParentSvg();
    const doc = menu.ownerDocument;
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
    const verticalPosition = workspace.toolboxPosition;
    const categoryById = id => toolbox.categoryMenu_.categories_.find(category => category.id_ === id);

    const close = () => {
        if (openId === null) return;
        categoryById(openId)?.item_.setAttribute('aria-expanded', 'false');
        openId = null;
        flyout.hide();
    };

    const showCategory = (category, scroll = 0) => {
        const label = doc.createElement('label');
        label.setAttribute('text', category.name_);
        label.setAttribute('web-class', 'categoryLabel');
        label.setAttribute('showStatusButton', category.showStatusButton_);
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
        toolbox.setSelectedItem(category, false);
        category.item_.setAttribute('aria-expanded', 'true');
        showCategory(category);
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
    toolbox.showAll_ = () => {
        if (!horizontal) {
            original.showAll.call(toolbox);
            return;
        }
        const category = categoryById(openId);
        if (category) showCategory(category, flyout.getScrollPos());
        else close();
    };
    toolbox.populate_ = tree => {
        original.populate.call(toolbox, tree);
        if (!horizontal) return;
        const category = categoryById(openId);
        if (category) toolbox.setSelectedItem(category, false);
        updateCategoryButtons();
    };

    flyout.getWidth = () => {
        const width = original.getFlyoutWidth.call(flyout);
        return horizontal ? Math.min(width, Math.max(1, menu.clientWidth - 8)) : width;
    };
    flyout.position = () => {
        if (!horizontal) {
            original.position.call(flyout);
            return;
        }
        const category = categoryById(openId);
        if (!category || !flyout.isVisible() || !surface.clientWidth || !surface.clientHeight) return;

        // Keep the existing vertical flyout and scrollbar. Only their viewport and origin change.
        const width = flyout.getWidth();
        const top = menu.offsetHeight;
        const height = Math.max(4, Math.min(360, surface.clientHeight * 0.65, surface.clientHeight - top - 4));
        const offset = surface.getBoundingClientRect();
        const anchor = category.item_.getBoundingClientRect();
        const preferredLeft = workspace.RTL ? anchor.right - offset.left - width : anchor.left - offset.left;
        const left = Math.min(Math.max(0, preferredLeft), menu.clientWidth - width);

        flyout.width_ = width;
        flyout.height_ = height;
        flyout.setBackgroundPath_(width, height);
        panel.setAttribute('width', width);
        panel.setAttribute('height', height);
        panel.style.transform = `translate(${left}px, ${top}px)`;
        flyout.scrollbar_.setOrigin(left, top);
        flyout.scrollbar_.resize();
        panel.style.opacity = '1';
    };
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
        if (openId !== null && ![menu, panel, scrollbar, DropDownDiv.DIV]
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
        events.abort();
        WidgetDiv.hideIfOwner(toolbox);
        original.dispose.call(toolbox);
    };
    palettes.add(setMode);
    setMode(horizontalLayout);
};

export const installHorizontalBlockPalette = (ScratchBlocks, {allowManualToggle = false} = {}) => {
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
        attach(ScratchBlocks, this, allowManualToggle);
        return result;
    };
};
