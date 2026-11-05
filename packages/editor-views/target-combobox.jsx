import React, {useEffect, useRef, useState} from 'react';
import styles from './target-combobox.css';

function Thumbnail({target}) {
    return target?.thumbnailUrl ?
        <img className={styles.thumbnail} src={target.thumbnailUrl} alt="" /> :
        <span className={styles.thumbnail} aria-hidden="true" />;
}

export function TargetCombobox({id, targets, value, onSelect, onRename, disabled, locale}) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? '編集対象' : 'Editing target';
    const optionsLabel = japanese ? '編集対象の候補' : 'Editing target options';
    const selected = targets.find(target => target.id === value);
    const [popup, setPopup] = useState(null);
    const [draft, setDraft] = useState(null);
    const input = useRef(null);
    const canRename = selected && !selected.isStage;
    const open = !disabled && popup !== null && popup.value === value && targets.length > 0;
    const listId = `${id}-options`;
    const optionId = index => `${listId}-${index}`;
    const highlight = open ? targets.findIndex(target => target.id === popup.highlighted) : -1;
    const show = () => setPopup({value, highlighted: selected?.id ?? targets[0]?.id});
    useEffect(() => {
        if (disabled) {
            setPopup(null);
            setDraft(null);
        }
    }, [disabled]);

    function choose(target) {
        setPopup(null);
        setDraft(null);
        onSelect(target.id);
    }

    function commitName() {
        const name = draft?.id === value ? draft.name.trim() : '';
        setDraft(null);
        if (!disabled && canRename && name && name !== selected.name) onRename(name);
    }

    function keyDown(event) {
        if (event.nativeEvent.isComposing) return;
        const {key} = event;
        if (key === 'Escape' && (open || draft)) {
            event.preventDefault();
            if (open) setPopup(null);
            else setDraft(null);
        } else if (key === 'Enter') {
            event.preventDefault();
            if (open && highlight >= 0) choose(targets[highlight]);
            else commitName();
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
        <div className={styles.root} onBlur={event => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setPopup(null);
            if (event.currentTarget.ownerDocument.hasFocus()) commitName();
        }}>
            <div className={styles.field}>
                <Thumbnail target={selected} />
                <input aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
                    aria-controls={open ? listId : undefined} aria-expanded={open} aria-label={label}
                    aria-autocomplete="none" autoComplete="off" id={id} disabled={disabled || !targets.length}
                    onChange={event => {
                        setPopup(null);
                        setDraft({id: value, name: event.currentTarget.value});
                    }}
                    onKeyDown={keyDown} readOnly={!canRename} ref={input} role="combobox" type="text"
                    value={draft?.id === value ? draft.name : selected?.name ?? ''} />
                <button aria-label={optionsLabel} aria-expanded={open} disabled={disabled || !targets.length}
                    onPointerDown={event => event.preventDefault()} onClick={() => {
                        if (open) setPopup(null);
                        else show();
                        input.current?.focus();
                    }} tabIndex={-1} type="button">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m4 6 4 4 4-4" />
                    </svg>
                </button>
            </div>
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
