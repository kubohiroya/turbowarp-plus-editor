import {sb3SaveFormats} from '@kubohiroya/turbowarp-sb3-save-format';

const formatLabels = {
    '': ['標準の格納方式を使う', 'Use default storage'],
    'remote-non-cacheable': ['HTTPS から毎回取得', 'Fetch from HTTPS each time'],
    'remote-cacheable': ['HTTPS から取得・キャッシュ可', 'Fetch from HTTPS, caching allowed'],
    'embedded-file': ['SB3 内のファイル', 'File in the SB3'],
    'embedded-data': ['作品 JSON 内のデータ', 'Data in the project JSON']
};

export function renderPayloadForm(document, edit, locale, close) {
    const ja = locale.startsWith('ja');
    const label = (jp, en) => ja ? jp : en;
    const make = (tag: string, text?: string) => {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        return node;
    };
    const controller = new AbortController();
    const form = make('form');
    const inputs = new Map();
    const intro = make('p', label(
        '設定した形式は次の SB3 保存に使われます。リモート形式の URL は現在の内容と一致する必要があります。',
        'These formats are used the next time you save an SB3. Remote URLs must serve the current bytes.'));
    form.append(intro);
    for (const [kind, heading] of [
        ['source', label('ソースデータ', 'Source Data')], ['assets', label('アセット', 'Assets')]
    ]) {
        const group = make('fieldset');
        group.append(make('legend', heading));
        const items = edit.items.filter(item => item.kind === kind);
        if (!items.length) group.append(make('p', label('設定できる項目がありません。', 'No items are available.')));
        for (const item of items) {
            const row = make('label', item.label);
            const format = make('select');
            format.setAttribute('aria-label', `${heading} – ${item.label}`);
            for (const id of ['', ...sb3SaveFormats]) {
                const option = make('option', label(formatLabels[id][0], formatLabels[id][1]));
                option.value = id;
                format.append(option);
            }
            format.value = item.format || '';
            row.append(format);
            const urlRow = make('label', `${item.label} HTTPS URL`);
            const url = make('input');
            url.inputMode = 'url';
            url.value = item.url || '';
            urlRow.append(url);
            const update = () => {
                const needed = format.value.startsWith('remote-');
                urlRow.hidden = !needed;
                url.required = needed;
                url.disabled = !needed;
            };
            format.addEventListener('change', update);
            update();
            group.append(row, urlRow);
            inputs.set(item.id, {format, url});
        }
        form.append(group);
    }
    const error = make('p');
    error.setAttribute('role', 'alert');
    const cancel = make('button', label('キャンセル', 'Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    const apply = make('button', label('適用', 'Apply'));
    apply.type = 'submit';
    apply.disabled = !inputs.size;
    form.append(error, cancel, apply);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (apply.disabled) return;
        apply.disabled = true;
        error.textContent = '';
        const choices = new Map([...inputs].filter(([, {format}]) => format.value)
            .map(([id, {format, url}]) => [id, {format: format.value, url: url.value.trim()}]));
        try {
            await edit.apply(choices, controller.signal);
            if (!controller.signal.aborted) close();
        } catch (failure) {
            if (controller.signal.aborted) return;
            error.textContent = failure.message;
            apply.disabled = false;
        }
    });
    return {form, dispose: () => controller.abort()};
}

export function renderBundleAssetForm(document, conversion, locale, close) {
    const ja = locale.startsWith('ja');
    const label = (jp, en) => ja ? jp : en;
    const make = (tag: string, text?: string) => {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        return node;
    };
    const controller = new AbortController();
    const form = make('form');
    const select = title => {
        const row = make('label', title);
        const input = make('select');
        row.append(input);
        form.append(row);
        return input;
    };
    const fill = (input, choices) => {
        input.replaceChildren(...choices.map(([value, text]) => {
            const option = make('option', text);
            option.value = value;
            return option;
        }));
    };
    const intro = make('p', label(
        '選んだ素材を作品に追加します。紙芝居から使う元の素材はバンドル内に保持します。',
        'Add the selected material to the project. The original stays in the bundle for Kamishibai.'));
    form.append(intro);
    const material = select(label('バンドル素材', 'Bundle material'));
    const kind = select(label('追加する種類', 'Add as'));
    const target = select(label('追加先', 'Target'));
    const kinds = {
        costume: label('コスチューム', 'Costume'),
        backdrop: label('背景', 'Backdrop'),
        sound: label('音', 'Sound')
    };
    const targetsFor = type => type ? conversion.targets.filter(item => type === 'sound' ||
        (type === 'backdrop' ? item.stage : !item.stage)) : [];
    const status = make('p');
    status.setAttribute('role', 'status');
    const error = make('p');
    error.setAttribute('role', 'alert');
    const cancel = make('button', label('閉じる', 'Close'));
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    const add = make('button', label('作品に追加', 'Add to project'));
    add.type = 'submit';
    form.append(status, error, cancel, add);
    const showTargets = () => {
        fill(target, targetsFor(kind.value).map(item => [item.id, item.stage ? label('ステージ', 'Stage') : item.name]));
        add.disabled = !target.value;
    };
    const showKinds = () => {
        const selected = conversion.materials.find(item => item.key === material.value);
        fill(kind, (selected?.kinds || []).filter(type => targetsFor(type).length).map(type => [type, kinds[type]]));
        showTargets();
    };
    fill(material, conversion.materials.map(item => [item.key, item.label]));
    if (!conversion.materials.length) {
        status.textContent = label('追加できる画像や音がありません。', 'There are no supported images or sounds.');
    }
    material.addEventListener('change', showKinds);
    kind.addEventListener('change', showTargets);
    showKinds();
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (add.disabled) return;
        const choice = {key: material.value, kind: kind.value, targetId: target.value};
        for (const control of [material, kind, target, add]) control.disabled = true;
        status.textContent = '';
        error.textContent = '';
        try {
            const name = await conversion.add(choice, controller.signal);
            if (controller.signal.aborted) return;
            status.textContent = label(`「${name}」を追加しました。作品を SB3 に保存できます。`,
                `Added “${name}”. You can save the project as an SB3.`);
        } catch (failure) {
            if (controller.signal.aborted) return;
            error.textContent = label(`素材を追加できませんでした。${failure.message}`,
                `Could not add the material. ${failure.message}`);
        } finally {
            if (!controller.signal.aborted) {
                for (const control of [material, kind, target, add]) control.disabled = false;
            }
        }
    });
    return {form, dispose: () => controller.abort()};
}
