import React from 'react';
import styles from './edit-menu.css';

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
    vm: object;
    locale: string;
    MenuItem: React.ComponentType<{className?: string; children: React.ReactNode}>;
    MenuSection: React.ComponentType<{children: React.ReactNode}>;
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
const shortcuts = {undo: 90, redo: 89, cut: 88, copy: 67, paste: 86};

function canRun(context: WorkspaceContext | undefined, command: Command): boolean {
    if (command === 'findAndReplace' || !context?.canUse()) return false;
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

function EditMenu({vm, locale, MenuItem, MenuSection, onRequestClose}: MenuProps) {
    const japanese = /^ja(?:-|$)/i.test(locale);
    const context = workspaces.get(vm);
    return <>{groups.map(group => <MenuSection key={group[0][0]}>
        {group.map(([command, english, translated]) => <MenuItem key={command}>
            <button className={styles.command} type="button" disabled={!canRun(context, command)} onClick={event => {
                const current = workspaces.get(vm);
                if (command === 'findAndReplace' || !canRun(current, command)) return;
                // Keep cut, copy and paste on the same ScratchBlocks clipboard.
                current.ScratchBlocks.onKeyDown_({target: event.currentTarget, keyCode: shortcuts[command],
                    ctrlKey: true, shiftKey: false, preventDefault: () => event.preventDefault()});
                onRequestClose();
            }}>{japanese ? translated : english}</button>
        </MenuItem>)}
    </MenuSection>)}</>;
}
