// Keep a real VM project fixture shared by integration checks and documentation captures.
const roots = ['message-start', 'message-receiver', 'message-key'];

async function installMessageScripts(page) {
    await page.waitForFunction(() => window.vm?.editingTarget && window.ScratchBlocks?.getMainWorkspace());
    await page.evaluate(() => {
        const vm = window.vm;
        const target = vm.editingTarget;
        vm.runtime.getTargetForStage().createVariable('message-ready', 'ready', 'broadcast_msg');
        const block = (id, opcode, values = {}) => target.blocks.createBlock({
            id, opcode, parent: null, next: null, topLevel: false, shadow: false, fields: {}, inputs: {}, ...values
        });
        block('message-start', 'event_whenflagclicked', {topLevel: true, x: 90, y: 90, next: 'message-send'});
        block('message-send', 'event_broadcast', {parent: 'message-start', next: 'message-wait',
            inputs: {BROADCAST_INPUT: {name: 'BROADCAST_INPUT', block: 'message-send-menu', shadow: 'message-send-menu'}}});
        block('message-wait', 'event_broadcastandwait', {parent: 'message-send',
            inputs: {BROADCAST_INPUT: {name: 'BROADCAST_INPUT', block: 'message-wait-menu', shadow: 'message-wait-menu'}}});
        for (const id of ['message-send', 'message-wait']) {
            block(`${id}-menu`, 'event_broadcast_menu', {parent: id, shadow: true,
                fields: {BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: 'ready', id: 'message-ready', variableType: 'broadcast_msg'}}});
        }
        block('message-receiver', 'event_whenbroadcastreceived', {topLevel: true, x: 470, y: 90,
            next: 'message-show', fields: {BROADCAST_OPTION: {name: 'BROADCAST_OPTION', value: 'ready', id: 'message-ready', variableType: 'broadcast_msg'}}});
        block('message-show', 'looks_show', {parent: 'message-receiver'});
        block('message-key', 'event_whenkeypressed', {topLevel: true, x: 90, y: 330,
            next: 'message-hide', fields: {KEY_OPTION: {name: 'KEY_OPTION', value: 'space'}}});
        block('message-hide', 'looks_hide', {parent: 'message-key'});
        vm.refreshWorkspace();
    });
}

function messageScriptPositions(page) {
    return page.evaluate(ids => ids.map(id => {
        const {x, y} = window.vm.editingTarget.blocks.getBlock(id);
        return [x, y];
    }), roots);
}

module.exports = {installMessageScripts, messageScriptPositions};
