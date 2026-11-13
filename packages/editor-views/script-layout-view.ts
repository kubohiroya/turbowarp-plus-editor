import './script-layout.css';
import {arrangeScripts} from './script-layout.ts';
import {paintScripts, readScripts, type LayoutWorkspace} from './script-layout-workspace.ts';
import {openRearrangement, type RearrangementContext} from './script-layout-dialog.ts';

export type ScriptView = 'free' | 'z' | 'n';

interface ViewOptions {
    workspace: LayoutWorkspace;
    getLocale(): string;
    mount?: HTMLElement;
    initialView?: ScriptView;
    canShowBlock?(): boolean;
    onChange?(view: ScriptView): void;
    passive?: boolean;
}

export function attachScriptView({workspace, getLocale, mount, initialView = 'free', canShowBlock, onChange, passive = false}: ViewOptions) {
    const injection = workspace.getInjectionDiv();
    const host = mount ?? injection;
    const document = host.ownerDocument;
    const window = document.defaultView;
    const bar = document.createElement('div');
    bar.className = 'tw-script-views';
    bar.dataset.codeViewControl = '';
    bar.setAttribute('role', 'group');
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
    const choices = [
        {view: 'free', short: 'Free', jaShort: '通常', label: 'Free layout view', jaLabel: '自由配置ビュー'},
        {view: 'z', short: 'Z', jaShort: 'Z', label: 'Z serial view', jaLabel: 'Z直列ビュー'},
        {view: 'n', short: 'N', jaShort: 'N', label: 'N serial view', jaLabel: 'N直列ビュー'}
    ] as const;
    const buttons = choices.map(choice => {
        const button = document.createElement('button');
        button.type = 'button';
        const glyph = document.createElement('span');
        if (choice.view === 'n') glyph.className = 'tw-script-view-mirror';
        button.append(glyph);
        if (passive) button.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
        });
        button.addEventListener('click', () => chooseView(choice.view));
        bar.append(button);
        return {button, glyph};
    });

    let japanese: boolean | undefined;
    function labels() {
        const ja = /^ja(?:-|$)/i.test(getLocale());
        if (japanese === ja) return;
        japanese = ja;
        bar.setAttribute('aria-label', ja ? 'コードの表示方式' : 'Code view');
        choices.forEach((choice, index) => {
            const {button, glyph} = buttons[index];
            glyph.textContent = ja ? choice.jaShort : choice.short;
            const label = ja ? choice.jaLabel : choice.label;
            button.title = label;
            button.setAttribute('aria-label', label);
        });
    }

    function render() {
        frame = undefined;
        labels();
        if (view === 'free') return;
        surface.setAttribute('aria-label', buttons[view === 'z' ? 1 : 2].button.title);
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
        observer.disconnect();
        view = next;
        surface.hidden = view === 'free';
        svg.toggleAttribute('data-script-serial', view !== 'free');
        buttons.forEach(({button}, index) => button.setAttribute('aria-pressed', String(choices[index].view === view)));
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

    bar.addEventListener('click', event => event.stopPropagation());
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
    bar.addEventListener('keydown', event => {
        event.stopPropagation();
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = buttons.findIndex(({button}) => button === document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 :
            (index + (event.key === 'ArrowRight' ? 1 : 2)) % buttons.length;
        buttons[next].button.focus();
        chooseView(choices[next].view);
    });
    host.append(surface, bar);
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
            bar.remove();
            surface.remove();
            svg.removeAttribute('data-script-serial');
        }
    };
}

interface DockedScriptLayoutOptions {
    vm: {editingTarget?: object; runtime?: {getEditingTarget(): unknown}};
    workspace: LayoutWorkspace & {
        options: {readOnly: boolean};
    };
    ScratchBlocks: {Events: RearrangementContext['events']; getMainWorkspace(): unknown};
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
    const view = attachScriptView({workspace, getLocale: () => injection.ownerDocument.documentElement.lang || locale,
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
