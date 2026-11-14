import './procedure-editor.css';

export function installProcedureEditor({blocks, workspace, getLocale, canEdit, commit}) {
    const document = workspace.getInjectionDiv().ownerDocument as Document;
    let cancel = () => {};
    let creating = false;
    const createDefinition = blocks.Procedures.createProcedureDefCallback_;
    blocks.Procedures.createProcedureDefCallback_ = function (source) {
        creating = true;
        try {
            createDefinition.call(this, source);
        } finally {
            creating = false;
        }
    };

    blocks.Procedures.externalProcedureDefCallback = (mutation, apply) => {
        if (!canEdit()) return;
        cancel();
        const originalName = creating ? null : mutation.getAttribute('proccode');
        const ja = /^ja(?:-|$)/i.test(getLocale());
        const text = ja ? {
            title: 'ブロック定義', input: '引数を追加（数値または文字列）', boolean: '真偽値の引数を追加',
            label: 'ラベルを追加', warp: '画面を再描画せずに実行する', cancel: 'キャンセル', save: 'OK',
            duplicate: 'このブロック定義はすでにあります。'
        } : {
            title: 'Block definition', input: 'Add number or text input', boolean: 'Add boolean input',
            label: 'Add label', warp: 'Run without screen refresh', cancel: 'Cancel', save: 'OK',
            duplicate: 'This block definition already exists.'
        };
        const dialog = document.createElement('dialog');
        dialog.className = 'twPlusProcedureDialog';
        dialog.setAttribute('aria-label', text.title);
        dialog.innerHTML = `<form>
            <h2></h2>
            <div data-procedure-workspace></div>
            <div data-procedure-buttons></div>
            <label><input type="checkbox"><span></span></label>
            <p role="alert" hidden></p>
            <footer class="tw-plus-dialog-actions"></footer>
        </form>`;
        dialog.querySelector('h2').textContent = text.title;
        dialog.querySelector('label span').textContent = text.warp;
        const error = dialog.querySelector('p');
        const form = dialog.querySelector('form');
        const addButton = (container, label, onClick?: () => void) => {
            const button = document.createElement('button');
            button.type = onClick ? 'button' : 'submit';
            button.textContent = label;
            if (onClick) button.addEventListener('click', onClick);
            dialog.querySelector(container).appendChild(button);
            return button;
        };
        const area = dialog.querySelector<HTMLElement>('[data-procedure-workspace]');
        document.body.appendChild(dialog);
        dialog.showModal();

        // ScratchBlocks positions its text editor in document coordinates.
        // The full-viewport dialog keeps that widget inside the modal focus scope.
        const widget = blocks.WidgetDiv.DIV;
        dialog.appendChild(widget);
        const draft = blocks.inject(area, {
            toolbox: '<xml></xml>', media: workspace.options.pathToMedia, scrollbars: true,
            rtl: workspace.RTL, zoom: {startScale: 0.9}
        });
        const declaration = draft.newBlock('procedures_declaration');
        declaration.setMovable(false);
        declaration.setDeletable(false);
        declaration.contextMenu = false;
        declaration.domToMutation(mutation);
        declaration.initSvg();
        declaration.render();
        declaration.moveBy(16, 20);
        const warp = dialog.querySelector('input');
        warp.checked = declaration.getWarp();

        cancel = () => {
            cancel = () => {};
            blocks.WidgetDiv.hide(true);
            document.body.appendChild(widget);
            draft.dispose();
            workspace.markFocused();
            dialog.close();
            dialog.remove();
        };
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            cancel();
        });
        const addPart = (label, add) => addButton('[data-procedure-buttons]', label, () => {
            blocks.WidgetDiv.hide(true);
            declaration.onChangeFn();
            add.call(declaration);
        });
        addPart(text.input, declaration.addStringNumberExternal);
        addPart(text.boolean, declaration.addBooleanExternal);
        addPart(text.label, declaration.addLabelExternal);
        addButton('footer', text.cancel, () => cancel()).dataset.dialogAction = 'cancel';
        addButton('footer', text.save).dataset.dialogAction = 'confirm';
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!canEdit()) {
                cancel();
                return;
            }
            blocks.WidgetDiv.hide(true);
            declaration.onChangeFn();
            declaration.setWarp(warp.checked);
            const result = declaration.mutationToDom(true);
            const name = result.getAttribute('proccode');
            if (name !== originalName && blocks.Procedures.getDefineBlock(name, workspace)) {
                error.textContent = text.duplicate;
                error.hidden = false;
                return;
            }
            cancel();
            commit(() => {
                apply(result);
                workspace.refreshToolboxSelection_();
            });
        });
    };
    return {cancel: () => cancel()};
}
