import './script-layout.css';
import {arrangeScripts} from './script-layout.ts';
import {paintScripts, readScripts, type LayoutWorkspace} from './script-layout-workspace.ts';
import {openRearrangement, type RearrangementContext} from './script-layout-dialog.ts';
import {attachScriptViewMenu, type ScriptViewMenuBlocks, type ScriptViewMenuWorkspace} from './script-view-menu.ts';

export type ScriptView = 'free' | 'z' | 'n';

interface ViewOptions {
    workspace: LayoutWorkspace & ScriptViewMenuWorkspace;
    ScratchBlocks: ScriptViewMenuBlocks;
    getLocale(): string;
    mount?: HTMLElement;
    initialView?: ScriptView;
    canShowBlock?(): boolean;
    onChange?(view: ScriptView): void;
    hasWorkspaceMenu?(): boolean;
}

const choices = [
    {view: 'free', label: 'Normal layout view', jaLabel: '通常配置の見え方'},
    {view: 'z', label: 'Z layout view', jaLabel: 'Z配置の見え方'},
    {view: 'n', label: 'N layout view', jaLabel: 'N配置の見え方'}
] as const;

export function attachScriptView({
    workspace, ScratchBlocks, getLocale, mount, initialView = 'free', canShowBlock, onChange, hasWorkspaceMenu = () => true
}: ViewOptions) {
    const injection = workspace.getInjectionDiv();
    const host = mount ?? injection;
    const document = host.ownerDocument;
    const window = document.defaultView;
    const surface = document.createElement('div');
    surface.className = 'tw-script-view-surface';
    surface.dataset.codeViewControl = '';
    surface.tabIndex = 0;
    surface.toggleAttribute('data-can-show-block', Boolean(canShowBlock));
    const contents = document.createElement('div');
    surface.append(contents);
    let view = initialView;
    let frame: number | undefined;
    const svg = workspace.getParentSvg();
    const observer = new window.MutationObserver(update);
    const japanese = () => /^ja(?:-|$)/i.test(getLocale());

    function labels() {
        const choice = choices.find(choice => choice.view === view);
        surface.setAttribute('aria-label', japanese() ? choice.jaLabel : choice.label);
    }

    const menu = attachScriptViewMenu(ScratchBlocks, workspace, host, surface, target =>
        view === 'free' ? !hasWorkspaceMenu() && (target === host || target.closest('.blocklyMainBackground') !== null) :
            surface.contains(target) && !target.closest('[data-script-view-block]'),
    () => {
        const ja = japanese();
        return {
            label: ja ? 'コードの並びの見え方を変更する' : 'Change code layout view',
            choices: choices.map(choice => ({
                text: ja ? choice.jaLabel : choice.label,
                enabled: true,
                checked: choice.view === view,
                callback: () => chooseView(choice.view)
            }))
        };
    });

    function render() {
        frame = undefined;
        labels();
        if (view === 'free') return;
        const {left, right, top} = svg.getBoundingClientRect();
        const toolbox = injection.querySelector(':scope > .blocklyToolboxDiv');
        if (toolbox) {
            const bounds = toolbox.getBoundingClientRect();
            const horizontal = toolbox.hasAttribute('data-horizontal-block-palette');
            surface.style.setProperty('--tw-script-view-top', horizontal ? `${Math.max(0, bounds.bottom - top)}px` : '0px');
            surface.style.setProperty('--tw-script-view-left', !horizontal && bounds.left <= left + 2 ? `${bounds.width}px` : '0px');
            surface.style.setProperty('--tw-script-view-right', !horizontal && bounds.right >= right - 2 ? `${bounds.width}px` : '0px');
        }
        paintScripts(contents, arrangeScripts(readScripts(workspace), view, 'vertical'), workspace.scale || 1);
    }

    function update() {
        if (view === 'free' || frame !== undefined) return;
        frame = window.requestAnimationFrame(render);
    }

    function setView(next: ScriptView) {
        menu.close();
        observer.disconnect();
        view = next;
        surface.hidden = view === 'free';
        svg.toggleAttribute('data-script-serial', view !== 'free');
        labels();
        if (view === 'free') contents.replaceChildren();
        else {
            observer.observe(workspace.getCanvas(), {attributes: true, childList: true, subtree: true});
            surface.scrollTo(0, 0);
            update();
        }
    }

    function chooseView(next: ScriptView) {
        setView(next);
        onChange?.(next);
    }

    surface.addEventListener('click', event => {
        event.stopPropagation();
        const id = (event.target as Element).closest('[data-script-view-block]')?.getAttribute('data-script-view-block');
        if (!id || !canShowBlock?.()) return;
        chooseView('free');
        workspace.centerOnBlock(id);
    });
    const resize = new window.ResizeObserver(update);
    resize.observe(host);
    const language = new window.MutationObserver(labels);
    language.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    // The Blockly keyboard listener is document-wide.
    surface.addEventListener('keydown', event => {
        if (event.key !== 'Tab') event.stopPropagation();
    });
    host.append(surface);
    setView(initialView);
    return {
        update,
        labels,
        get view() { return view; },
        setView,
        dispose() {
            resize.disconnect();
            observer.disconnect();
            language.disconnect();
            if (frame !== undefined) window.cancelAnimationFrame(frame);
            menu.dispose();
            surface.remove();
            svg.removeAttribute('data-script-serial');
        }
    };
}

interface DockedScriptLayoutOptions {
    vm: {editingTarget?: object; runtime?: {getEditingTarget(): unknown}};
    workspace: LayoutWorkspace & ScriptViewMenuWorkspace & {
        options: {readOnly: boolean};
    };
    ScratchBlocks: ScriptViewMenuBlocks & {Events: RearrangementContext['events']; getMainWorkspace(): unknown};
    canUse(): boolean;
    locale: string;
}

const dockedViews = new WeakMap<object, ReturnType<typeof attachDockedScriptLayout>>();

export function getDockedScriptLayout(vm: object) {
    return dockedViews.get(vm);
}

export function attachDockedScriptLayout({vm, workspace, ScratchBlocks, canUse, locale}: DockedScriptLayoutOptions) {
    const injection = workspace.getInjectionDiv();
    const wrapper = injection.closest('[class*="gui_blocks-wrapper_"]');
    const host = wrapper?.parentElement ?? injection;
    const canArrange = () => {
        const group = host.closest('.dv-groupview');
        // The last sprite's workspace can stay visible when a stage or document group is active.
        return Boolean(vm.editingTarget && vm.runtime?.getEditingTarget() === vm.editingTarget &&
            canUse() && workspace.isVisible() && !workspace.isDragging() && !workspace.options.readOnly &&
            ScratchBlocks.getMainWorkspace() === workspace && !host.closest('[hidden], [inert]') &&
            (!group || group.classList.contains('dv-active-group')));
    };
    const view = attachScriptView({workspace, ScratchBlocks, getLocale: () => injection.ownerDocument.documentElement.lang || locale,
        canShowBlock: canArrange});
    host.setAttribute('data-code-hover-surface', '');
    let dialog: ReturnType<typeof openRearrangement> | undefined;
    const attachment = {
        view,
        canArrange,
        open(locale: string) {
            if (!canArrange()) return;
            dialog?.close();
            dialog = openRearrangement({workspace, events: ScratchBlocks.Events, canArrange, target: () => vm.editingTarget}, locale);
        },
        dispose() {
            dialog?.close();
            view.dispose();
            host.removeAttribute('data-code-hover-surface');
            if (dockedViews.get(vm) === attachment) dockedViews.delete(vm);
        }
    };
    dockedViews.set(vm, attachment);
    return attachment;
}
