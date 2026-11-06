import React from 'react';

interface ExtensionMenuOptions {
    locale?: string;
    MenuSection: React.ElementType;
    MenuItem: React.ElementType;
    onAddExtension?: () => void;
    onRequestClose(): void;
}

export function renderExtensionFileMenu({locale = 'en', MenuSection, MenuItem, onAddExtension, onRequestClose}:
    ExtensionMenuOptions) {
    if (!onAddExtension) return null;
    function open() {
        onRequestClose();
        onAddExtension();
    }
    return React.createElement(MenuSection, null, React.createElement(MenuItem, {command: 'extension', onClick: open},
        React.createElement('span', {
            role: 'button',
            tabIndex: 0,
            onKeyDown(event: React.KeyboardEvent) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                open();
            }
        }, /^ja(?:-|$)/i.test(locale) ? '機能拡張を追加…' : 'Add an Extension…')));
}

const glyphs = {
    new: 'M5 3h9l5 5v13H5z M14 3v5h5 M9 14h6 M12 11v6',
    window: 'M3 5h18v14H3z M3 9h18 M9 14h6 M12 11v6',
    save: 'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-7h8v7',
    copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
    remix: 'M18 8a7 7 0 1 0 0 8 M18 3v5h-5 M18 8l2-2',
    open: 'M3 6h7l2 2h9l-2 11H3z M3 11h16',
    'save-as': 'M4 3h13l3 3v15H4z M8 3v6h8V3 M9 17h6 M12 14v6',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
    package: 'm12 3 8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10 M8 5l8 4',
    restore: 'M4 10a8 8 0 1 1 2 8 M4 4v6h6 M12 7v5l3 2',
    properties: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
    payloads: 'M9 5 4 12l5 7 M15 5l5 7-5 7 M14 4l-4 16',
    'bundle-assets': 'M4 5h16v14H4z M12 8v8 M8 12h8',
    diagnostics: 'M3 12h4l2-5 4 10 2-5h6'
};

const iconSize = 16;
const iconStyle = {width: iconSize, height: iconSize, flex: 'none'};
const rowStyle = {display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle'};

export function createFileMenuItem(MenuItem: React.ElementType, extensionIcon: string) {
    return function FileMenuItem({command, children, ...props}: {
        command?: keyof typeof glyphs | 'extension';
        children: React.ReactNode;
        [prop: string]: unknown;
    }) {
        let icon: React.ReactNode;
        if (command === 'extension') {
            icon = React.createElement('span', {'aria-hidden': true, 'data-file-menu-icon': command, style: {
                ...iconStyle, backgroundColor: 'currentColor', mask: `url("${extensionIcon}") center / contain no-repeat`
            }});
        } else if (command && glyphs[command]) {
            icon = React.createElement('svg', {'aria-hidden': true, 'data-file-menu-icon': command,
                viewBox: '0 0 24 24', style: iconStyle, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
                strokeLinecap: 'round', strokeLinejoin: 'round'}, React.createElement('path', {d: glyphs[command]}));
        }
        return React.createElement(MenuItem, props, icon ?
            React.createElement('span', {style: rowStyle}, icon, React.createElement('span', null, children)) : children);
    };
}
