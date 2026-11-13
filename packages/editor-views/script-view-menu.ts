interface MenuOption {
    text: string | Node[];
    enabled: boolean;
    callback(): void;
}

interface MenuItem {
    getElement(): HTMLElement;
    setCheckable(checkable: boolean): void;
    setChecked(checked: boolean): void;
    performActionInternal(): boolean;
    handleContextMenu(): void;
}

interface Menu {
    getElement(): HTMLElement;
    getChildAt(index: number): MenuItem;
    setHighlightedIndex(index: number): void;
    dispose(): void;
}

export interface ScriptViewMenuBlocks {
    ContextMenu: {
        populate_(options: MenuOption[], rtl: boolean): Menu;
        position_(menu: Menu, event: MouseEvent, rtl: boolean): void;
        createWidget_(menu: Menu): void;
    };
    WidgetDiv: {
        DIV: HTMLElement;
        dispose_: (() => void) | null;
        show(owner: object, rtl: boolean, dispose: () => void): void;
        hideIfOwner(owner: object): void;
    };
}

export interface ScriptViewMenuWorkspace {
    RTL: boolean;
    showContextMenu_(event: MouseEvent): void;
}

interface MenuConfig {
    label: string;
    choices: (MenuOption & {checked: boolean})[];
}

export function attachScriptViewMenu(
    {ContextMenu, WidgetDiv}: ScriptViewMenuBlocks,
    workspace: ScriptViewMenuWorkspace,
    host: HTMLElement,
    surface: HTMLElement,
    isBackground: (target: Element) => boolean,
    getMenu: () => MenuConfig
) {
    const document = host.ownerDocument;
    let closeMenu: (() => void) | undefined;

    function addSubmenu(menu: Menu, index: number, {label, choices}: MenuConfig, rtl: boolean, owner: object) {
        const root = menu.getElement();
        const item = menu.getChildAt(index);
        const trigger = item.getElement();
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
        const backKey = rtl ? 'ArrowRight' : 'ArrowLeft';
        let submenu: Menu | undefined;
        const close = () => WidgetDiv.hideIfOwner(owner);

        function closeSubmenu(restoreFocus = false) {
            if (!submenu) return;
            const hadFocus = submenu.getElement().contains(document.activeElement);
            submenu.dispose();
            submenu = undefined;
            trigger.setAttribute('aria-expanded', 'false');
            if (restoreFocus && hadFocus) root.focus();
        }

        function openSubmenu(focus: boolean) {
            if (!submenu) {
                submenu = ContextMenu.populate_(choices.map(choice => ({
                    ...choice,
                    callback() {
                        close();
                        choice.callback();
                    }
                })), rtl);
                ContextMenu.createWidget_(submenu);
                choices.forEach(({checked}, choiceIndex) => {
                    const option = submenu.getChildAt(choiceIndex);
                    option.setCheckable(true);
                    option.setChecked(checked);
                    const element = option.getElement();
                    element.setAttribute('role', 'menuitemradio');
                    element.setAttribute('aria-checked', String(checked));
                });
                const popup = submenu.getElement();
                popup.classList.add('tw-script-view-submenu');
                popup.setAttribute('aria-label', label);
                const {clientWidth, clientHeight} = document.documentElement;
                const {width, height} = popup.getBoundingClientRect();
                const {left, right} = root.getBoundingClientRect();
                const {top} = trigger.getBoundingClientRect();
                const placeLeft = rtl ? left >= width : right + width > clientWidth && left >= width;
                const x = placeLeft ? left - width + 1 : right - 1;
                popup.style.left = `${Math.max(0, Math.min(x, clientWidth - width))}px`;
                popup.style.top = `${Math.max(0, Math.min(top, clientHeight - height))}px`;
                popup.addEventListener('keydown', event => {
                    if (event.key !== backKey && event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeSubmenu(true);
                }, true);
                trigger.setAttribute('aria-expanded', 'true');
            }
            if (focus) {
                submenu.getElement().focus();
                submenu.setHighlightedIndex(choices.findIndex(choice => choice.checked));
            }
        }

        trigger.addEventListener('pointerenter', () => openSubmenu(false));
        root.addEventListener('pointerover', event => {
            if (!trigger.contains(event.target as Node)) closeSubmenu(true);
        });
        root.addEventListener('keydown', event => {
            if (event.key === nextKey && trigger.contains(document.getElementById(root.getAttribute('aria-activedescendant')))) {
                event.preventDefault();
                event.stopPropagation();
                openSubmenu(true);
            } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                closeSubmenu();
            } else if (event.key === 'Escape' || event.key === 'Tab') {
                close();
            }
        }, true);
        item.performActionInternal = () => {
            openSubmenu(true);
            return true;
        };
        item.handleContextMenu = () => {};

        closeMenu = close;
        const dispose = WidgetDiv.dispose_;
        WidgetDiv.dispose_ = () => {
            closeSubmenu();
            if (closeMenu === close) closeMenu = undefined;
            dispose?.();
        };
    }

    function triggerOption(label: string): MenuOption {
        const arrow = document.createElement('span');
        arrow.className = 'tw-script-view-menu-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        return {text: [document.createTextNode(label), arrow], enabled: true, callback() {}};
    }

    const showContextMenu = workspace.showContextMenu_;
    workspace.showContextMenu_ = function (event) {
        const populate = ContextMenu.populate_;
        // Only extend the options collected for this workspace, after the existing add-ons.
        ContextMenu.populate_ = (options, rtl) => {
            const config = getMenu();
            const menu = populate.call(ContextMenu, [...options, triggerOption(config.label)], rtl);
            addSubmenu(menu, options.length, config, rtl, ContextMenu);
            return menu;
        };
        try {
            showContextMenu.call(this, event);
        } finally {
            ContextMenu.populate_ = populate;
        }
    };

    function showStandaloneMenu(event: MouseEvent) {
        if (!isBackground(event.target as Element)) return;
        event.preventDefault();
        event.stopPropagation();
        const config = getMenu();
        const rtl = workspace.RTL;
        const menu = ContextMenu.populate_([triggerOption(config.label)], rtl);
        const outside = new document.defaultView.AbortController();
        WidgetDiv.show(surface, rtl, () => {
            outside.abort();
            menu.dispose();
        });
        addSubmenu(menu, 0, config, rtl, surface);
        ContextMenu.position_(menu, event, rtl);
        document.addEventListener('pointerdown', event => {
            if (!WidgetDiv.DIV.contains(event.target as Node)) WidgetDiv.hideIfOwner(surface);
        }, {capture: true, signal: outside.signal});
    }

    function keepPreviewInactive(event: PointerEvent) {
        // Focusing a background pane on pointerdown would replace its preview before contextmenu.
        if ((event.button === 2 || (event.button === 0 && event.ctrlKey)) && isBackground(event.target as Element)) {
            event.preventDefault();
        }
    }

    host.addEventListener('pointerdown', keepPreviewInactive);
    host.addEventListener('contextmenu', showStandaloneMenu);
    return {
        close() {
            closeMenu?.();
        },
        dispose() {
            closeMenu?.();
            workspace.showContextMenu_ = showContextMenu;
            host.removeEventListener('pointerdown', keepPreviewInactive);
            host.removeEventListener('contextmenu', showStandaloneMenu);
        }
    };
}
