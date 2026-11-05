import React from 'react';
import styles from './icon-menu-button.css';

export function IconMenuButton({label, icon, items, className}) {
    const [open, setOpen] = React.useState(false);
    const root = React.useRef(null);
    const trigger = React.useRef(null);
    const list = React.useRef(null);
    const hasItemIcons = items.some(item => item.icon);

    React.useLayoutEffect(() => {
        if (open) list.current?.firstElementChild?.focus();
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
    return <div className={className ? `${styles.root} ${className}` : styles.root} ref={root}
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
            <span className={styles.triggerIcon} aria-hidden="true">{icon}</span>
        </button>
        {open && <div className={styles.menu} ref={list} role="menu" aria-label={label} onKeyDown={event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            const buttons = Array.from(list.current.children);
            const index = buttons.indexOf(event.target);
            const last = buttons.length - 1;
            let next;
            if (event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
            else if (event.key === 'ArrowUp') next = index <= 0 ? last : index - 1;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = last;
            else return;
            event.preventDefault();
            buttons[next]?.focus();
        }}>
            {items.map(({id, label: itemLabel, icon: itemIcon, checked, checkbox, current, disabled, separatorBefore, onSelect}) =>
                <button key={id} type="button" role={checkbox ? 'menuitemcheckbox' :
                    (checked === undefined ? 'menuitem' : 'menuitemradio')}
                    aria-checked={checked} aria-current={current || undefined} aria-disabled={disabled} data-separator-before={separatorBefore || undefined}
                    tabIndex={-1} onClick={() => {
                        if (disabled) return;
                        close();
                        onSelect();
                    }}>
                    {hasItemIcons && <span className={styles.itemIcon} aria-hidden="true">{itemIcon}</span>}
                    {itemLabel}
                    {checkbox && <span className={styles.checkboxMark} aria-hidden="true">{checked ? '✓' : ''}</span>}
                </button>)}
        </div>}
    </div>;
}
