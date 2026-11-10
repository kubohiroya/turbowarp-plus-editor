import React from 'react';
import styles from './info-menu.css';

type MenuAction = {
    /** An image URL, or an inline icon such as an SVG drawn with `currentColor`. */
    icon: string | React.ReactNode;
    onClick: React.MouseEventHandler<HTMLButtonElement>;
};

type RuntimeItemProps = {
    children: React.ReactNode;
    className?: string;
    closeOnSelect?: boolean;
    onClick: React.MouseEventHandler<HTMLButtonElement>;
};

export interface ProjectSettingsMenuProps {
    leading?: boolean;
    displaySettings?: {
        items: React.ReactNode;
        open: boolean;
        onOpen(): void;
        onClose(): void;
    };
    renderRuntimeSettings?: (Item: React.ComponentType<RuntimeItemProps>) => React.ReactNode;
    addons?: MenuAction;
    advanced?: MenuAction;
    /** Opens the AI agent settings; listed right after the advanced settings. */
    aiAgents?: MenuAction;
}

interface ProjectInfoMenuProps extends ProjectSettingsMenuProps {
    locale: string;
    version: string;
    logo: string;
}

type Submenu = 'display' | 'runtime';

// Octicons mark-github-16 and law-16. See the distribution's NOTICE.
const githubPath = 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656';
const licensePath = 'M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.006.005-.01.01-.045.04c-.21.176-.441.327-.686.45C14.556 10.78 13.88 11 13 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.245.245 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.245.245 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.016.015-.045.04c-.21.176-.441.327-.686.45C4.556 10.78 3.88 11 3 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.249.249 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0Zm2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z';

const newTabIcon = (
    <svg className={styles.newTabIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3H3v10h10V8M10 3h3v3m0-3L7 9" />
    </svg>
);

export function ProjectInfoMenu({
    locale, version, logo, leading, displaySettings, renderRuntimeSettings, addons, advanced, aiAgents
}: ProjectInfoMenuProps) {
    const menu = React.useRef<HTMLDetailsElement>(null);
    const trigger = React.useRef<HTMLElement>(null);
    const displayTrigger = React.useRef<HTMLButtonElement>(null);
    const runtimeTrigger = React.useRef<HTMLButtonElement>(null);
    const displayList = React.useRef<HTMLUListElement>(null);
    const [open, setOpen] = React.useState(false);
    const [submenu, setSubmenu] = React.useState<Submenu>(null);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? 'TurboWarp Plus プロジェクト情報' : 'TurboWarp Plus project information';
    const product = `TurboWarp Plus Editor ${version}`;
    const displayLabel = japanese ? '表示設定' : 'Display settings';
    const runtimeLabel = japanese ? '動作設定' : 'Runtime settings';
    const newTabLabel = japanese ? '別のタブで開きます' : 'Opens in a new tab';

    const closeDisplay = displaySettings?.onClose;
    const close = React.useCallback(() => {
        if (submenu === 'display') closeDisplay?.();
        setSubmenu(null);
        setOpen(false);
    }, [submenu, closeDisplay]);
    const closeAndFocus = React.useCallback(() => {
        close();
        trigger.current.focus({preventScroll: true});
    }, [close]);

    React.useEffect(() => {
        if (!open) return;
        const node = menu.current;
        const dismiss = (event: PointerEvent) => {
            if (!node.contains(event.target as Node)) close();
        };
        node.ownerDocument.addEventListener('pointerdown', dismiss, true);
        return () => node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
    }, [open, close]);

    // The native theme and language actions close the GUI settings menu when selected.
    React.useEffect(() => {
        if (submenu === 'display' && !displaySettings?.open) closeAndFocus();
    }, [submenu, displaySettings?.open, closeAndFocus]);

    React.useLayoutEffect(() => {
        if (!displayList.current) return;
        // The reused GUI settings are list items whose click handlers live on the item or its content.
        for (const item of displayList.current.querySelectorAll('li')) item.tabIndex = 0;
    }, [submenu]);

    const RuntimeItem = React.useCallback(function RuntimeItem({children, className, closeOnSelect, onClick}: RuntimeItemProps) {
        return <button className={className ? `${styles.entry} ${className}` : styles.entry} type="button"
            onClick={event => {
                if (closeOnSelect) close();
                onClick(event);
            }}>
            {children}
        </button>;
    }, [close]);

    const toggleSubmenu = (name: Submenu) => {
        if (submenu === 'display') closeDisplay?.();
        if (submenu === name) {
            setSubmenu(null);
            return;
        }
        if (name === 'display') displaySettings.onOpen();
        setSubmenu(name);
    };
    const action = (label: string, item: MenuAction, opensInNewTab = false) => item && (
        <button className={styles.entry} type="button" title={opensInNewTab ? newTabLabel : undefined} onClick={event => {
            close();
            item.onClick(event);
        }}>
            {typeof item.icon === 'string' ? <img src={item.icon} alt="" draggable={false} /> : item.icon}
            {label}
            {opensInNewTab && newTabIcon}
        </button>
    );
    const activateDisplayItem = (event: React.KeyboardEvent<HTMLUListElement>) => {
        if ((event.key !== 'Enter' && event.key !== ' ') || !(event.target instanceof HTMLLIElement)) return;
        event.preventDefault();
        const content = event.target.firstElementChild;
        (content instanceof HTMLElement ? content : event.target).click();
    };

    const className = leading ? `${styles.root} ${styles.leading}` : styles.root;
    return <details className={className} ref={menu} open={open} onKeyDown={event => {
        if (event.key === ' ' &&
                (event.target instanceof HTMLButtonElement || event.target === trigger.current)) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) (event.target as HTMLElement).click();
            return;
        }
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        if (submenu) {
            const button = submenu === 'display' ? displayTrigger : runtimeTrigger;
            toggleSubmenu(submenu);
            button.current.focus({preventScroll: true});
            return;
        }
        closeAndFocus();
    }}>
        <summary ref={trigger} aria-label={label} title={label} onClick={event => {
            event.preventDefault();
            if (open) close();
            else setOpen(true);
        }}><img src={logo} alt="" draggable={false} /></summary>
        <nav aria-label={label}>
            <a className={`${styles.entry} ${styles.indented}`} href="./" target="_blank" rel="noreferrer"
                title={newTabLabel} onClick={close}>
                {japanese ? `${product}について` : `About ${product}`}
                {newTabIcon}
            </a>
            {displaySettings && <div className={styles.branch}>
                <button className={`${styles.entry} ${styles.indented}`} type="button" ref={displayTrigger}
                    aria-expanded={submenu === 'display'} onClick={() => toggleSubmenu('display')}>
                    {displayLabel}<span className={styles.caret} aria-hidden="true" />
                </button>
                {submenu === 'display' && <ul className={`${styles.flyout} ${styles.display}`} ref={displayList}
                    aria-label={displayLabel} onKeyDown={activateDisplayItem}>
                    {displaySettings.items}
                </ul>}
            </div>}
            {renderRuntimeSettings && <div className={styles.branch}>
                <button className={`${styles.entry} ${styles.indented}`} type="button" ref={runtimeTrigger}
                    aria-expanded={submenu === 'runtime'} onClick={() => toggleSubmenu('runtime')}>
                    {runtimeLabel}<span className={styles.caret} aria-hidden="true" />
                </button>
                {submenu === 'runtime' && <div className={styles.flyout} role="group" aria-label={runtimeLabel}>
                    {renderRuntimeSettings(RuntimeItem)}
                </div>}
            </div>}
            {action(japanese ? 'アドオン' : 'Addons', addons, true)}
            {action(japanese ? '高度な設定' : 'Advanced Settings', advanced)}
            {action(japanese ? 'AI エージェント設定…' : 'AI agent settings…', aiAgents)}
            <hr className={styles.divider} />
            <a className={styles.entry} href="https://github.com/kubohiroya/turbowarp-plus-editor"
                target="_blank" rel="noreferrer" title={newTabLabel} onClick={close}>
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={githubPath} /></svg>
                {japanese ? 'ソースコード' : 'Source code'}
                {newTabIcon}
            </a>
            <a className={styles.entry} href="credits.html" target="_blank" rel="noreferrer"
                title={newTabLabel} onClick={close}>
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={licensePath} /></svg>
                {japanese ? 'ライセンスとクレジット' : 'Licenses and credits'}
                {newTabIcon}
            </a>
        </nav>
    </details>;
}
