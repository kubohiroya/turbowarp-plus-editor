import React from 'react';
import styles from './edit-menu.css';
import {projectReplaceOpener, projectReplaceShortcut} from './project-search-connections.ts';
import type {SearchProject} from './project-search.ts';

interface Workspace {
    options: {readOnly: boolean};
    getParentSvg(): SVGElement;
    hasUndoStack(): boolean;
    hasRedoStack(): boolean;
    isDragging(): boolean;
    isVisible(): boolean;
    targetWorkspace?: Workspace;
    isFlyout: boolean;
}

interface WorkspaceContext {
    vm: object;
    workspace: Workspace;
    canUse(): boolean;
    ScratchBlocks: {
        getMainWorkspace(): Workspace;
        selected?: {workspace: Workspace; isDeletable(): boolean; isMovable(): boolean};
        clipboardXml_?: unknown;
        clipboardSource_?: Workspace;
        onKeyDown_(event: Pick<KeyboardEvent, 'target' | 'keyCode' | 'ctrlKey' | 'shiftKey' | 'preventDefault'>): void;
    };
}

interface MenuProps {
    vm: {runtime?: SearchProject};
    locale: string;
    MenuItem: React.ComponentType<{className?: string; children: React.ReactNode}>;
    MenuSection: React.ComponentType<{children: React.ReactNode}>;
    renderIcon(command: Command | 'restoreDeletion'): React.ReactNode;
    onRequestClose(): void;
}

const workspaces = new WeakMap<object, WorkspaceContext>();

export function attachEditMenuWorkspace(context: WorkspaceContext) {
    workspaces.set(context.vm, context);
    return {dispose() {
        if (workspaces.get(context.vm) === context) workspaces.delete(context.vm);
    }};
}

const groups = [
    [['undo', 'Undo', '元に戻す'], ['redo', 'Redo', '繰り返し']],
    [['cut', 'Cut', '切り取り'], ['copy', 'Copy', 'コピー'], ['paste', 'Paste', '貼り付け']],
    [['findAndReplace', 'Find and Replace', '検索と置換']]
] as const;

type Command = (typeof groups)[number][number][0];
const shortcutKeys = {undo: 'Z', redo: 'Y', cut: 'X', copy: 'C', paste: 'V'};

function shortcutFor(command: Command, mac: boolean) {
    if (command === 'findAndReplace') {
        const {label, macLabel, keys} = projectReplaceShortcut;
        return {label: mac ? macLabel : label, keys};
    }
    if (mac && command === 'redo') return {label: '⇧⌘Z', keys: 'Meta+Shift+Z'};
    const key = shortcutKeys[command];
    return mac ? {label: `⌘${key}`, keys: `Meta+${key}`} : {label: `Ctrl+${key}`, keys: `Control+${key}`};
}

function canRun(context: WorkspaceContext | undefined, command: Exclude<Command, 'findAndReplace'>): boolean {
    if (!context?.canUse()) return false;
    const {workspace, ScratchBlocks} = context;
    if (ScratchBlocks.getMainWorkspace() !== workspace || workspace.options.readOnly ||
        !workspace.isVisible() || workspace.isDragging() || workspace.getParentSvg().closest('[inert]')) return false;

    if (command === 'undo') return workspace.hasUndoStack();
    if (command === 'redo') return workspace.hasRedoStack();
    if (command === 'paste') {
        const source = ScratchBlocks.clipboardSource_;
        return Boolean(ScratchBlocks.clipboardXml_) && (source?.isFlyout ? source.targetWorkspace : source) === workspace;
    }

    const block = ScratchBlocks.selected;
    return Boolean(block?.isDeletable() && block.isMovable() && (block.workspace === workspace ||
        (command === 'copy' && block.workspace.isFlyout && block.workspace.targetWorkspace === workspace)));
}

export function renderEditMenu(props: MenuProps) {
    return <EditMenu {...props} />;
}

export function renderEditMenuRestore(label: React.ReactNode, renderIcon: MenuProps['renderIcon']) {
    return <span className={styles.restore}>{renderIcon('restoreDeletion')}{label}</span>;
}

function EditMenu({vm, locale, MenuItem, MenuSection, renderIcon, onRequestClose}: MenuProps) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const mac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');
    const context = workspaces.get(vm);
    const openReplace = projectReplaceOpener(vm.runtime);
    return <>{groups.map(group => <MenuSection key={group[0][0]}>
        {group.map(([command, english, translated]) => {
            const shortcut = shortcutFor(command, mac);
            return <MenuItem key={command}>
                <button className={styles.command} type="button"
                    disabled={command === 'findAndReplace' ? !openReplace : !canRun(context, command)}
                    aria-keyshortcuts={shortcut?.keys} onClick={event => {
                        if (command === 'findAndReplace') {
                            if (!openReplace) return;
                            onRequestClose();
                            openReplace();
                            return;
                        }
                        const current = workspaces.get(vm);
                        if (!canRun(current, command)) return;
                        // Keep cut, copy and paste on the same ScratchBlocks clipboard.
                        current.ScratchBlocks.onKeyDown_({target: event.currentTarget,
                            keyCode: shortcutKeys[command].charCodeAt(0), ctrlKey: true, shiftKey: false,
                            preventDefault: () => event.preventDefault()});
                        onRequestClose();
                    }}>
                    {renderIcon(command)}
                    <span>{japanese ? translated : english}</span>
                    {shortcut && <kbd className={styles.shortcut} aria-hidden="true">{shortcut.label}</kbd>}
                </button>
            </MenuItem>;
        })}
    </MenuSection>)}</>;
}
