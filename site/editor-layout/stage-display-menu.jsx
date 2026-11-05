import React from 'react';
import fullscreenIcon from '@tw-plus/gui-stage-fullscreen-icon';
import {StageDisplayMenuContext} from './context.js';
import {layoutFlags} from './index.jsx';
import styles from './stage-display-menu.css';

function DisplayMenu({locale, presets, fullscreen}) {
    const {dockAction} = React.useContext(StageDisplayMenuContext) ?? {};
    const [open, setOpen] = React.useState(false);
    const root = React.useRef(null);
    const trigger = React.useRef(null);
    const list = React.useRef(null);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? 'ステージの表示' : 'Stage display';
    const detached = dockAction?.kind === 'external';
    const dockLabel = detached ? (japanese ? 'ドックに戻す' : 'Dock stage') :
        dockAction?.external ? (japanese ? '別ウィンドウで開く' : 'Open in a separate window') :
            (japanese ? 'アンドック' : 'Undock stage');

    React.useLayoutEffect(() => {
        if (open) list.current.firstElementChild.focus();
    }, [open]);
    React.useEffect(() => {
        if (!open) return;
        const node = root.current;
        const dismiss = event => {
            if (!node.contains(event.target)) setOpen(false);
        };
        node.ownerDocument.addEventListener('pointerdown', dismiss, true);
        return () => node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
    }, [open]);

    const close = () => {
        setOpen(false);
        trigger.current.focus({preventScroll: true});
    };
    const selectDisplay = action => {
        close();
        if (detached) dockAction.dock();
        action();
    };

    return <div className={styles.root} ref={root}
        onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}>
        <button type="button" className={styles.trigger} ref={trigger} aria-label={label} title={label}
            aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
            onKeyDown={event => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setOpen(true);
            }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1.75" y="4" width="20.5" height="16" rx="2" />
                <path d="M10.5 4v16M4.5 9H7.5M4.5 12H7.5M4.5 15H7.5" />
                <rect x="13.5" y="7" width="5.75" height="4.5" rx="0.5" fill="var(--looks-secondary)" />
                <path d="m14.25 15 2.125 2 2.125-2" />
            </svg>
        </button>
        {open && <div className={styles.menu} ref={list} role="menu" aria-label={label} onKeyDown={event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            const items = Array.from(list.current.children);
            const index = items.indexOf(event.target);
            const last = items.length - 1;
            let next;
            if (event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
            else if (event.key === 'ArrowUp') next = index <= 0 ? last : index - 1;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = last;
            else return;
            event.preventDefault();
            items[next].focus();
        }}>
            {presets.map(({title, isSelected, handleClick, icon}) =>
                <button key={title} type="button" role="menuitemradio" aria-checked={isSelected} tabIndex={-1}
                    onClick={() => selectDisplay(handleClick)}>
                    <img className={styles.icon} src={typeof icon === 'function' ? icon() : icon} alt="" draggable={false} />
                    {title}
                </button>)}
            <button type="button" role="menuitem" tabIndex={-1}
                onClick={() => selectDisplay(fullscreen.handleClick)}>
                <img className={styles.icon} src={fullscreenIcon} alt="" draggable={false} />
                {fullscreen.title}
            </button>
            <button type="button" role="menuitem" tabIndex={-1} className={styles.dock}
                aria-disabled={!dockAction || dockAction.kind === 'opening'}
                onClick={() => {
                    if (!dockAction || dockAction.kind === 'opening') return;
                    close();
                    if (detached) dockAction.dock();
                    else dockAction.undock();
                }}>
                <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 4H3v9h9v-3" />
                    {detached ? <path d="M12.5 3.5 7 9m0-4v4h4" /> : <path d="M8 3h5v5m0-5L7 9" />}
                </svg>
                {dockLabel}
            </button>
        </div>}
    </div>;
}

export const StageDisplayMenu = layoutFlags.stageDisplayMenu ? DisplayMenu : undefined;
