import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {argumentTextCut, installBlockArgumentText} from '../src/block-argument-text.ts';

test('a value within the budget shows in full', () => {
    assert.equal(argumentTextCut('a'.repeat(30)), undefined);
    assert.equal(argumentTextCut('あ'.repeat(15)), undefined);
    assert.equal(argumentTextCut(''), undefined);
});

test('a longer value keeps one column for the ellipsis, counting wide characters twice', () => {
    assert.equal(argumentTextCut('a'.repeat(31)), 29);
    assert.equal(argumentTextCut('あ'.repeat(16)), 14);
    assert.equal(argumentTextCut(`${'a'.repeat(28)}あa`), 28);
});

test('a value is cut at its first line break', () => {
    assert.equal(argumentTextCut('first\nsecond'), 5);
    assert.equal(argumentTextCut('first\r\nsecond'), 5);
    assert.equal(argumentTextCut('\nx'), 0);
});

test('a cut never splits a surrogate pair', () => {
    assert.equal(argumentTextCut(`${'a'.repeat(27)}😀😀`), 29);
    assert.equal(argumentTextCut(`${'a'.repeat(28)}😀a`), 28);
});

// Shapes from scratch-blocks core/field.js and field_textinput.js, reduced to what the patch reads.
function fixture() {
    const {window} = new JSDOM('<!doctype html><body></body>');
    const document = window.document;
    const dialog = window.HTMLDialogElement.prototype;
    dialog.showModal ??= function () {this.open = true;};
    dialog.close ??= function () {this.open = false;};
    const calls: string[] = [];
    const events: unknown[] = [];
    class FieldTextInput {
        text_: string;
        sourceBlock_: any;
        constructor(text: string) {
            this.text_ = text;
        }
        getDisplayText_() {
            return this.text_.replace(/\s/g, ' ');
        }
        showEditor_(quietInput?: boolean, readOnly?: boolean) {
            calls.push(`inline:${String(quietInput)}:${String(readOnly)}`);
        }
        callValidator(text: string) {
            return text;
        }
        setText(text: string) {
            events.push(['change', this.text_, text]);
            this.text_ = text;
        }
    }
    class FieldNumber extends FieldTextInput {
        showEditor_() {
            super.showEditor_(false, false);
        }
    }
    const ScratchBlocks = {
        FieldTextInput, FieldNumber,
        ScratchMsgs: {currentLocale_: 'ja'},
        WidgetDiv: {hide() {calls.push('hide widget');}},
        Events: {setGroup(group: boolean) {events.push(['group', group]);}}
    };
    const block = {rendered: true, workspace: {getInjectionDiv: () => document.body}, render() {events.push(['render']);}};
    installBlockArgumentText(ScratchBlocks);
    const field = (Kind: typeof FieldTextInput, text: string) => {
        const created = new Kind(text);
        created.sourceBlock_ = block;
        return created;
    };
    return {document, window, calls, events, block, ScratchBlocks, field, FieldTextInput, FieldNumber};
}

test('the block shows the cut value with an ellipsis and keeps the full value', () => {
    const {field, FieldTextInput} = fixture();
    const long = field(FieldTextInput, 'hello world '.repeat(5));
    assert.equal(long.getDisplayText_(), `${'hello world '.repeat(2)}hello…`);
    assert.equal(long.text_, 'hello world '.repeat(5));
    assert.equal(field(FieldTextInput, 'short').getDisplayText_(), 'short');
});

test('installing twice wraps the field once', () => {
    const {ScratchBlocks, FieldTextInput} = fixture();
    const {getDisplayText_, showEditor_} = FieldTextInput.prototype;
    installBlockArgumentText(ScratchBlocks);
    assert.equal(FieldTextInput.prototype.getDisplayText_, getDisplayText_);
    assert.equal(FieldTextInput.prototype.showEditor_, showEditor_);
});

test('a short value keeps the inline editor', () => {
    const {document, calls, field, FieldTextInput} = fixture();
    field(FieldTextInput, 'short').showEditor_();
    assert.deepEqual(calls, ['inline:undefined:undefined']);
    assert.equal(document.querySelector('dialog'), null);
});

test('number fields and fields an extension took over keep their editors', () => {
    const {document, calls, field, FieldTextInput, FieldNumber} = fixture();
    field(FieldNumber, '1'.repeat(40)).showEditor_();
    const custom = field(FieldTextInput, 'x'.repeat(40));
    custom.showEditor_ = () => calls.push('custom');
    custom.showEditor_();
    field(FieldTextInput, 'x'.repeat(40)).showEditor_(false, true);
    assert.deepEqual(calls, ['inline:false:false', 'custom', 'inline:false:true']);
    assert.equal(document.querySelector('dialog'), null);
});

test('saving the dialog applies the edit as one grouped change', () => {
    const {document, window, calls, events, field, FieldTextInput} = fixture();
    const long = field(FieldTextInput, 'line one\nline two');
    long.showEditor_();
    const dialog = document.querySelector('dialog');
    assert.ok(dialog?.open);
    assert.equal(dialog.getAttribute('aria-label'), 'テキストを編集');
    assert.deepEqual(calls, ['hide widget']);
    const area = dialog.querySelector('textarea');
    assert.equal(area.value, 'line one\nline two');
    area.value = 'line one\nline 2';
    dialog.querySelector('form').dispatchEvent(new window.Event('submit', {cancelable: true}));
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(long.text_, 'line one\nline 2');
    assert.deepEqual(events, [['group', true], ['change', 'line one\nline two', 'line one\nline 2'], ['group', false], ['render']]);
});

test('cancelling the dialog leaves the value', () => {
    const {document, window, events, field, FieldTextInput} = fixture();
    const long = field(FieldTextInput, 'x'.repeat(40));
    long.showEditor_();
    document.querySelector('textarea').value = 'changed';
    document.querySelector('[data-dialog-action="cancel"]').dispatchEvent(new window.MouseEvent('click'));
    long.showEditor_();
    document.querySelector('dialog').dispatchEvent(new window.Event('cancel', {cancelable: true}));
    assert.equal(document.querySelector('dialog'), null);
    assert.equal(long.text_, 'x'.repeat(40));
    assert.deepEqual(events, []);
});

test('a save after the block went away changes nothing', () => {
    const {document, window, events, block, field, FieldTextInput} = fixture();
    const long = field(FieldTextInput, 'x'.repeat(40));
    long.showEditor_();
    block.workspace = null;
    document.querySelector('form').dispatchEvent(new window.Event('submit', {cancelable: true}));
    assert.equal(long.text_, 'x'.repeat(40));
    assert.deepEqual(events, []);
});
