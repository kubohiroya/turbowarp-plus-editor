import React, {useEffect, useState} from 'react';
import styles from './target-combobox.css';

function Thumbnail({target}) {
    return target?.thumbnailUrl ?
        <img className={styles.thumbnail} src={target.thumbnailUrl} alt="" /> :
        <span className={styles.thumbnail} aria-hidden="true" />;
}

export function TargetCombobox({id, targets, value, onSelect, disabled, locale}) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? '編集対象' : 'Editing target';
    const selected = targets.find(target => target.id === value);
    const [popup, setPopup] = useState(null);
    const open = !disabled && popup !== null && popup.value === value && targets.length > 0;
    const listId = `${id}-options`;
    const optionId = index => `${listId}-${index}`;
    const highlight = open ? targets.findIndex(target => target.id === popup.highlighted) : -1;
    const show = () => setPopup({value, highlighted: selected?.id ?? targets[0]?.id});
    useEffect(() => {
        if (disabled) setPopup(null);
    }, [disabled]);

    function choose(target) {
        setPopup(null);
        onSelect(target.id);
    }

    function keyDown(event) {
        const {key} = event;
        if (key === 'Escape' && open) {
            event.preventDefault();
            setPopup(null);
        } else if (key === 'ArrowDown' || key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
                show();
                return;
            }
            const next = Math.min(targets.length - 1, Math.max(0, highlight + (key === 'ArrowDown' ? 1 : -1)));
            setPopup({value, highlighted: targets[next].id});
            event.currentTarget.ownerDocument.getElementById(optionId(next))?.scrollIntoView({block: 'nearest'});
        }
    }

    return (
        <div className={styles.root}>
            <button aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
                aria-controls={open ? listId : undefined} aria-expanded={open} aria-label={label}
                className={styles.field} disabled={disabled || !targets.length} id={id} onBlur={() => setPopup(null)}
                onClick={() => {
                    if (open && highlight >= 0) choose(targets[highlight]);
                    else show();
                }}
                onKeyDown={keyDown} role="combobox" type="button">
                <Thumbnail target={selected} />
                <span className={styles.name}>{selected?.name ?? ''}</span>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 6 4 4 4-4" />
                </svg>
            </button>
            {open && <ul aria-label={label} className={styles.options} id={listId} role="listbox">
                {targets.map((target, index) => (
                    <li aria-selected={target.id === value} className={index === highlight ? styles.highlight : undefined}
                        id={optionId(index)} key={target.id} onClick={() => choose(target)}
                        onPointerDown={event => event.preventDefault()} role="option">
                        <Thumbnail target={target} />
                        <span>{target.name}</span>
                    </li>
                ))}
            </ul>}
        </div>
    );
}
