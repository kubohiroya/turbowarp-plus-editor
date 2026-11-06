import assert from 'node:assert/strict';
import test from 'node:test';
import {createFileMenuItem, renderExtensionFileMenu} from '../src/extension-file-menu.ts';

test('the extension command closes the File menu before opening the existing library', () => {
    const calls: string[] = [];
    const props = {locale: 'ja', MenuSection: 'div', MenuItem: 'li',
        onRequestClose: () => calls.push('close')};
    assert.equal(renderExtensionFileMenu(props), null);

    const section = renderExtensionFileMenu({...props, onAddExtension: () => calls.push('open')});
    const item = section.props.children;
    assert.equal(item.props.command, 'extension');
    assert.equal(item.props.children.props.children, '機能拡張を追加…');
    item.props.onClick();
    assert.deepEqual(calls, ['close', 'open']);
    calls.length = 0;
    item.props.children.props.onKeyDown({key: 'Escape'});
    assert.deepEqual(calls, []);
    item.props.children.props.onKeyDown({key: 'Enter', preventDefault() {}, stopPropagation() {}});
    assert.deepEqual(calls, ['close', 'open']);
});

test('file menu icons are decorative and the extension command uses the original artwork', () => {
    const item = createFileMenuItem('li', '/extension.svg')({command: 'extension', children: 'Extension'});
    const [icon, label] = item.props.children.props.children;
    assert.equal(icon.props['aria-hidden'], true);
    assert.match(icon.props.style.mask, /extension\.svg/);
    assert.equal(label.props.children, 'Extension');
});
