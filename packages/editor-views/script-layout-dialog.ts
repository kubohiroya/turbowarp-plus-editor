import {arrangeScripts, type LayoutDirection, type ScriptOrder} from './script-layout.ts';
import {moveScripts, paintScripts, readScripts, type LayoutEvents, type LayoutWorkspace} from './script-layout-workspace.ts';

export interface RearrangementContext {
    workspace: LayoutWorkspace;
    events: LayoutEvents;
    canArrange(): boolean;
    target(): unknown;
}

export function openRearrangement({workspace, events, canArrange, target}: RearrangementContext, locale: string) {
    const document = workspace.getInjectionDiv().ownerDocument;
    const ja = /^ja(?:-|$)/i.test(locale);
    const translate = (en: string, japanese: string) => ja ? japanese : en;
    events.fireNow_();
    const originalTarget = target();
    const scripts = readScripts(workspace);
    const dialog = document.createElement('dialog');
    dialog.className = 'tw-script-layout-dialog';
    dialog.setAttribute('aria-label', translate('Rearrange Code Blocks', 'コードブロックの再配置'));
    const title = document.createElement('h2');
    title.textContent = dialog.getAttribute('aria-label');
    const controls = document.createElement('div');
    controls.className = 'tw-script-layout-options';
    const preview = document.createElement('div');
    preview.className = 'tw-script-layout-preview';
    preview.tabIndex = 0;
    preview.setAttribute('aria-label', translate('Layout preview', '再配置のプレビュー'));
    const footer = document.createElement('footer');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const cancel = document.createElement('button');
    cancel.textContent = translate('Cancel', 'キャンセル');
    const apply = document.createElement('button');
    apply.textContent = translate('Rearrange', '再配置する');
    const order = select(translate('Order', '順序'), [
        ['z', translate('Z · by row', 'Z方式（行順）')], ['n', translate('N · by column', 'N方式（列順）')]
    ]);
    const direction = select(translate('Direction', '方向'), [
        ['vertical', translate('Vertical', '垂直')], ['horizontal', translate('Horizontal', '水平')]
    ]);
    let placements: ReturnType<typeof arrangeScripts<(typeof scripts)[number]>>;

    function select(label: string, choices: [string, string][]) {
        const field = document.createElement('label');
        field.textContent = label;
        const input = document.createElement('select');
        for (const [value, text] of choices) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            input.append(option);
        }
        input.addEventListener('change', update);
        field.append(input);
        controls.append(field);
        return input;
    }

    function update() {
        placements = arrangeScripts(scripts, order.value as ScriptOrder, direction.value as LayoutDirection);
        paintScripts(preview, placements, 0.8);
        preview.scrollTo(0, 0);
        apply.disabled = scripts.length === 0;
        status.textContent = scripts.length ? '' : translate('There are no scripts to rearrange.', '再配置するスクリプトがありません。');
    }

    function close() {
        if (dialog.open) dialog.close();
        dialog.remove();
    }

    cancel.addEventListener('click', close);
    dialog.addEventListener('close', close, {once: true});
    dialog.addEventListener('keydown', event => event.stopPropagation());
    apply.addEventListener('click', () => {
        events.fireNow_();
        const current = readScripts(workspace);
        if (!canArrange() || target() !== originalTarget || current.length !== scripts.length ||
                current.some(({block, x, y, width, height}, i) => {
                    const original = scripts[i];
                    return block !== original.block || x !== original.x || y !== original.y ||
                        width !== original.width || height !== original.height;
                })) {
            status.textContent = translate('The code changed. Reopen this dialog to preview it again.',
                'コードが変わりました。ダイアログを開き直して再度プレビューしてください。');
            apply.disabled = true;
            return;
        }
        moveScripts(workspace, events, placements);
        close();
        if (placements.length) workspace.centerOnBlock(placements[0].script.id);
    });
    footer.append(status, cancel, apply);
    dialog.append(title, controls, preview, footer);
    document.body.append(dialog);
    update();
    dialog.showModal();
    order.focus();
    return {close};
}
