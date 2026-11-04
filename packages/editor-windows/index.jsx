import React from 'react';

const row = {display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0};

export function WindowTitleBar({title, target, children}) {
    return (
        <header aria-label={title} style={{...row, justifyContent: 'space-between', padding: '0.25rem 0.5rem'}}>
            <div style={row}>
                {target}
                <strong>{title}</strong>
            </div>
            <div style={row}>{children}</div>
        </header>
    );
}

export function WindowTargetSelector({targets, value, onChange, disabled = false,
    label = 'Editing target', placeholder = 'Select a sprite or stage',
    spriteLabel = 'Sprites', stageLabel = 'Stage'}) {
    const groups = [
        {kind: 'sprite', label: spriteLabel},
        {kind: 'stage', label: stageLabel}
    ];
    const selected = targets.some(target => target.id === value) ? value : '';
    return (
        <select aria-label={label} value={selected} disabled={disabled}
            onChange={event => onChange(event.currentTarget.value)}>
            <option value="" disabled>{placeholder}</option>
            {groups.map(group => {
                const options = targets.filter(target => target.kind === group.kind);
                return options.length ? (
                    <optgroup key={group.kind} label={group.label}>
                        {options.map(target => (
                            <option key={target.id} value={target.id} disabled={target.disabled}>
                                {target.name}
                            </option>
                        ))}
                    </optgroup>
                ) : null;
            })}
        </select>
    );
}

export function OpenWindowButton({onOpen, disabled = false, label = 'Open in another window'}) {
    return <button type="button" disabled={disabled} onClick={onOpen}>{label}</button>;
}

export function MinimizeWindowButton({onMinimize, disabled = false, label = 'Minimize window'}) {
    return <button type="button" disabled={disabled} onClick={onMinimize}>{label}</button>;
}

export function MaximizeWindowButton({maximized = false, onChange, disabled = false,
    maximizeLabel = 'Maximize window', restoreLabel = 'Restore window'}) {
    return (
        <button type="button" disabled={disabled} onClick={() => onChange(!maximized)}>
            {maximized ? restoreLabel : maximizeLabel}
        </button>
    );
}

export function DockWindowButton({onDock, disabled = false, label = 'Close and dock'}) {
    return <button type="button" disabled={disabled} onClick={onDock}>{label}</button>;
}
