import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {attachDockedCodeExtensions, getCodeDynamicShapes, getCodeExtensions} from '../code-extensions.ts';
import {captureNativeFieldDrawing} from '../native-field-svg.ts';
import {createIsolatedNativeField, registerCustomFields, reserveAttachedNativeField} from '../custom-extension-fields.ts';
import {createCodeSession, encodeEdit} from '../index.ts';
import {removeObsoleteProcedureInputs} from '../procedure-edits.ts';

function fixture(receiveBackpackDrop) {
    const document = {defaultView: new EventTarget(), hasFocus: () => focused === document};
    let focused = document;
    const node = {inert: false};
    const nativeUndo = () => {};
    const workspace = {
        getParentSvg: () => ({parentElement: node}),
        undo: nativeUndo,
        hasUndoStack: () => false,
        hasRedoStack: () => false,
        cancelCurrentGesture() {},
        addChangeListener() {},
        removeChangeListener() {}
    };
    const stage = {
        variables: {},
        createVariable(id, name, type) {this.variables[id] = {name, type, toXML: () => ''};}
    };
    const makeTarget = id => {
        const blocks = {
            _blocks: {block: {x: 0, reference: 'first'}} as Record<string, any>,
            _scripts: ['block'],
            getScripts() {return this._scripts;},
            getBlock(id) {return this._blocks[id];},
            toXML() {return '';},
            blocklyListen(event) {this._blocks.block.x = event.newCoordinate.x;},
            updateAssetName(before, after) {
                if (this._blocks.block.reference === before) this._blocks.block.reference = after;
            },
            resetCache() {},
            emitProjectChanged() {}
        };
        return {id, name: id, isOriginal: true, blocks, variables: {}, comments: {},
            lookupVariableById(id) {return this.variables[id] ?? stage.variables[id];}, getName() {return this.name;}};
    };
    const target = makeTarget('first');
    const other = makeTarget('other');
    const vm = Object.assign(new EventEmitter(), {
        editingTarget: target,
        runtime: {
            targets: [target, other],
            getTargetForStage: () => stage,
            getTargetById: id => [target, other].find(sprite => sprite.id === id),
            getEditingTarget: () => vm.editingTarget
        },
        setEditingTarget(id) {
            this.editingTarget = this.runtime.getTargetById(id);
            this.emit('targetsUpdate');
            this.emit('workspaceUpdate');
        },
        renameSprite(id, name) {
            const sprite = this.runtime.getTargetById(id);
            for (const item of this.runtime.targets) item.blocks.updateAssetName(sprite.name, name, 'sprite');
            sprite.name = name;
            this.emit('targetsUpdate');
        }
    });
    const session = createCodeSession({
        vm, workspace, document, canUse: () => true, receiveBackpackDrop,
        ScratchBlocks: {hideChaff() {}, Events: {disable() {}, enable() {}, fireNow_() {}}}
    });
    function connect(sprite) {
        const child = {hasFocus: () => focused === child};
        const messages = [];
        const port = Object.assign(new EventTarget(), {start() {}, postMessage: message => messages.push(message)});
        const send = data => port.dispatchEvent(new MessageEvent('message', {data}));
        const close = session.attach({target: sprite, mount: {ownerDocument: child}, port, close: () => close()});
        return {messages, send, close, focus() {focused = child; send({type: 'focus'});}};
    }
    return {session, connect, target, other, vm, node, workspace, nativeUndo, focusParent() {
        focused = document;
        document.defaultView.dispatchEvent(new Event('focus'));
    }};
}

test('a focused window gets a lease after release and stale edits do not enter the shared history', () => {
    const {session, connect, target, other, workspace, nativeUndo, node, focusParent} = fixture();
    const a = connect(target);
    const b = connect(target);
    const last = view => view.messages.at(-1);
    const edit = (view, lease, targetId, x) => view.send({type: 'edits', lease, targetId,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x, y: 0}}]});
    const x = () => target.blocks._blocks.block.x;

    a.focus();
    const aLease = last(a).lease;
    assert.ok(aLease && node.inert);
    edit(b, aLease, target.id, 123);
    assert.equal(x(), 0);
    edit(a, aLease, target.id, 20);
    assert.equal(x(), 20);
    assert.equal(last(b).type, 'update');

    b.focus();
    assert.equal(last(a).type, 'revoke');
    assert.equal(last(b).type, 'update');
    a.send({type: 'release', lease: aLease});
    const bLease = last(b).lease;
    assert.ok(bLease > aLease);
    edit(a, aLease, target.id, 300);
    edit(b, bLease, other.id, 400);
    assert.equal(x(), 20);
    assert.equal(other.blocks._blocks.block.x, 0);
    b.send({type: 'step', lease: bLease, targetId: target.id, redo: false});
    assert.equal(x(), 0);
    b.send({type: 'step', lease: bLease, targetId: target.id, redo: true});
    assert.equal(x(), 20);

    focusParent();
    b.send({type: 'release', lease: bLease});
    assert.equal(node.inert, false);
    workspace.undo(false);
    assert.equal(x(), 0);
    a.close();
    b.close();
    session.dispose();
    assert.equal(workspace.undo, nativeUndo);
});

test('comment edits use the active target and restore serializable comments in the shared history', () => {
    const {session, connect, target, other, vm} = fixture();
    class Comment {
        constructor(id, blockId, text, x, y, width, height, minimized) {
            Object.assign(this, {id, blockId, text, x, y, width, height, minimized});
        }
        toXML() {return `<comment>${this.text}</comment>`;}
    }
    for (const sprite of [target, other]) {
        sprite.createComment = function (...args) {
            const comment = new Comment(...args);
            this.comments[comment.id] = comment;
        };
    }
    // The VM resolves comments through its runtime editing target, even on another Blocks instance.
    target.blocks.blocklyListen = event => vm.runtime.getEditingTarget().createComment(event.commentId,
        event.blockId, event.text, event.xy.x, event.xy.y, event.width, event.height, event.minimized);
    const child = connect(target);
    child.focus();
    const {lease} = child.messages.at(-1);
    const edit = (commentId, text) => child.send({type: 'edits', lease, targetId: target.id, events: [
        encodeEdit({type: 'comment_create', commentId, blockId: null, text, xy: {x: 10, y: 20},
            width: 100, height: 100, minimized: false})
    ]});
    edit('note', 'saved');
    assert.equal(target.comments.note.text, 'saved');
    child.send({type: 'step', lease, targetId: target.id, redo: false});
    assert.equal(Object.keys(target.comments).length, 0);
    child.send({type: 'step', lease, targetId: target.id, redo: true});
    assert.equal(target.comments.note.toXML(), '<comment>saved</comment>');

    vm.setEditingTarget(other.id);
    edit('late', 'stale draft');
    assert.equal(Object.hasOwn(target.comments, 'late'), false);
    assert.deepEqual(other.comments, {});
    session.dispose();
});

for (const [kind, type, fieldName, opcode] of [
    ['scalar', '', 'VARIABLE', 'data_variable'],
    ['list', 'list', 'LIST', 'data_listcontents'],
    ['broadcast', 'broadcast_msg', 'BROADCAST_OPTION', 'event_whenbroadcastreceived']
]) {
    test(`${kind} reference edits stay in scope and rejected batches preserve shared history`, () => {
        const {session, connect, target, other, vm} = fixture();
        const variable = {name: 'shared', type, toXML: () => ''};
        const stage = vm.runtime.getTargetForStage();
        const broadcast = type === 'broadcast_msg';
        const visible = broadcast ? stage : target;
        Object.assign(stage.variables, {global: variable});
        Object.assign(visible.variables, {mine: variable, wrongType: {...variable, type: type === '' ? 'list' : ''}});
        Object.assign(other.variables, {foreign: variable});
        if (broadcast) Object.assign(target.variables, {local: variable});
        const reference = (id, value = variable.name, blockOpcode = opcode) =>
            ({opcode: blockOpcode, fields: {[fieldName]: {id, value}}});
        target.blocks._blocks.block = reference('global');
        target.blocks._blocks.legacy = reference('deleted');
        target.blocks.blocklyListen = function (event) {
            if (event.type === 'create') {
                const [id, name] = event.xml.outerHTML.split(':');
                this._blocks[event.blockId] = reference(id, name, broadcast ? 'event_broadcast_menu' : opcode);
            } else {
                this._blocks[event.blockId].fields[fieldName].id = event.newValue;
            }
        };

        const child = connect(target);
        const mirror = connect(target);
        child.focus();
        const {lease} = child.messages.at(-1);
        const send = (...events) => child.send({type: 'edits', lease, targetId: target.id, events});
        const change = (newValue, blockId = 'block') => ({type: 'change', element: 'field', blockId,
            name: fieldName, newValue});
        const create = xml => ({type: 'create', blockId: 'new', xml});
        const field = () => target.blocks.getBlock('block').fields[fieldName].id;
        const step = redo => child.send({type: 'step', lease, targetId: target.id, redo});

        const invalid = [[change('foreign')], [change('deleted')], [change('wrongType')],
            [change('mine'), create('foreign:shared')], [create('mine:stale')], [create('wrongType:shared')],
            [create('mine:shared'), change('foreign', 'new')]];
        if (broadcast) invalid.push([change('local')], [create('local:shared')]);
        for (const edits of invalid) {
            send(...edits);
            assert.equal(field(), 'global');
            assert.equal(target.blocks.getBlock('new'), undefined);
            assert.equal(child.messages.at(-1).canUndo, false);
        }

        send(change('mine'), create('mine:shared'));
        assert.equal(field(), 'mine');
        assert.equal(target.blocks.getBlock('new').fields[fieldName].id, 'mine');
        assert.equal(target.blocks.getBlock('legacy').fields[fieldName].id, 'deleted');
        assert.equal(mirror.messages.at(-1).canUndo, true);
        step(false);
        assert.equal(field(), 'global');
        assert.equal(target.blocks.getBlock('new'), undefined);
        if (broadcast) delete stage.variables['mine'];
        step(true);
        if (broadcast) assert.equal(stage.variables['mine']?.name, variable.name);
        assert.equal(field(), 'mine');
        assert.equal(target.blocks.getBlock('new').fields[fieldName].id, 'mine');
        assert.equal(other.blocks.getBlock('new'), undefined);
        session.dispose();
    });
}

test('code extension projections send definitions and resolve menus only for the active target', () => {
    const active = {};
    const back = {};
    let menuReads = 0;
    const runtime = {
        getEditingTarget: () => active,
        getBlocksXML: target => Object.assign([{id: 'fixture', xml: target === active ? 'active palette' : 'back palette'}], {
            map() {throw new Error('Add-on palette methods must not be used or sent');}
        }),
        _blockInfo: [{id: 'fixture', menus: [{json: {
            type: 'fixture_menu_mode', args0: [{type: 'field_dropdown', options: () => {
                menuReads++;
                return [['Choice', 'choice']];
            }}]
        }}], blocks: [
            {json: {type: 'fixture_block', args0: [{type: 'field_image', src: 'https://example.invalid/icon'}]}},
            {json: {type: 'fixture_dynamic'}, info: {isDynamic: true}},
            {json: {type: 'motion_movesteps'}}
        ]}]
    };

    const passive = getCodeExtensions(runtime, back);
    assert.equal(menuReads, 0);
    assert.deepEqual(passive.definitions[0].args0, [{type: 'field_dropdown', options: [['', '']]}]);
    const editable = getCodeExtensions(runtime, active);
    assert.equal(menuReads, 1);
    assert.deepEqual(editable.definitions.map(block => block.type), ['fixture_menu_mode', 'fixture_block']);
    assert.deepEqual(editable.definitions[0].args0, [{type: 'field_dropdown', options: [['Choice', 'choice']]}]);
    assert.deepEqual(editable.definitions[1].args0, [{type: 'field_image', src: ''}]);
    assert.equal(editable.categories[0].xml, 'active palette');
    assert.deepEqual(structuredClone(editable), editable);
});

test('custom extension fields project data-only editors and keep existing field registrations', () => {
    const info = (name, implementation) => ({
        extendedName: `fixture_${name}`, fieldImplementation: implementation,
        scratchBlocksDefinition: {json: {type: `fixture_${name}`, args0: [{type: `field_fixture_${name}`}]}}
    });
    const options = [['First', 'id-1'], ['Second', 'id-2']];
    const customFieldTypes = {
        mode: info('mode', {type: 'field_dropdown', options, fromJson() {throw new Error('must not run');}}),
        name: info('name', {type: 'field_input'}),
        unsafe: info('unsafe', {fromJson() {throw new Error('must not run');}}),
        invalid: info('invalid', {type: 'field_dropdown', options: [[{src: 'https://invalid.example'}, 'bad']]})
    };
    const projected = getCodeExtensions({_blockInfo: [{id: 'fixture', customFieldTypes}]}, {});
    assert.deepEqual(structuredClone(projected), projected);
    assert.deepEqual(projected.definitions.map(definition => definition.type), ['fixture_mode', 'fixture_name', 'fixture_unsafe']);
    assert.deepEqual(projected.customFields, [
        {name: 'field_fixture_mode', editor: {type: 'field_dropdown', options}},
        {name: 'field_fixture_name', editor: {type: 'field_input'}},
        {name: 'field_fixture_unsafe', editor: {type: 'native_widget'}}
    ]);
    assert.notEqual(projected.customFields[0].editor.options[0], options[0]);

    const native = {fromJson() {}};
    const registry = {field_fixture_name: native};
    const unregister = registerCustomFields({
        Field: {TYPE_MAP_: registry, register(name, factory) {registry[name] = factory;}},
        FieldDropdown: class {constructor(options) {this.options = options;}}
    }, projected.customFields);
    assert.deepEqual(registry.field_fixture_mode.fromJson().options, options);
    assert.equal(registry.field_fixture_name, native);
    unregister();
    assert.deepEqual(registry, {field_fixture_name: native});
});

test('isolated native editors use fresh fields and preserve factory options', () => {
    const name = 'field_fixture_isolated';
    const registry = {};
    let cached;
    const factory = {
        parentDocument: true,
        isolatedEditor: true,
        fromJson(options) {
            const value = options.value;
            options.value = 'mutated by factory';
            return cached ?? {getValue: () => value, setValue() {}, showEditor_() {}};
        }
    };
    const unregister = registerCustomFields({
        Field: {TYPE_MAP_: registry, register(name, field) {registry[name] = field;}}
    }, [{name, editor: {type: 'native_widget'}}], undefined, () => factory);
    const docked = registry[name].fromJson({value: 'saved option'});
    assert.equal(createIsolatedNativeField(docked, {...factory, isolatedEditor: false}), undefined);
    cached = docked;
    assert.equal(createIsolatedNativeField(docked, factory), undefined);
    cached = undefined;
    const isolated = createIsolatedNativeField(docked, {...factory});
    assert.notEqual(isolated, docked);
    assert.equal(isolated.getValue(), 'saved option');
    cached = isolated;
    assert.equal(createIsolatedNativeField(docked, factory), undefined);
    assert.equal(registry[name].fromJson({value: 'other'}), undefined);
    unregister();
});

test('an attached native editor cannot reserve or register the same field twice', () => {
    const name = 'field_fixture_attached';
    const registry = {};
    const field = {sourceBlock_: undefined};
    const factory = {parentDocument: true, attachedEditor: true, fromJson: () => field};
    const unregister = registerCustomFields({
        Field: {TYPE_MAP_: registry, register(name, field) {registry[name] = field;}}
    }, [{name, editor: {type: 'native_widget'}}], undefined, () => factory);
    assert.equal(registry[name].fromJson({}), field);
    assert.equal(reserveAttachedNativeField(field, factory), false);
    field.sourceBlock_ = {};
    assert.equal(reserveAttachedNativeField(field, {...factory, attachedEditor: false}), false);
    assert.equal(reserveAttachedNativeField(field, {...factory}), true);
    assert.equal(reserveAttachedNativeField(field, factory), false);
    assert.equal(registry[name].fromJson({}), undefined);
    unregister();
});

test('native SVG projection keeps visible shapes and omits executable and externally linked content', () => {
    const svg = (localName, attributes = {}, childNodes = []) => ({
        namespaceURI: 'http://www.w3.org/2000/svg', localName, nodeType: 1, childNodes,
        attributes: Object.entries(attributes).map(([name, value]) => ({name, value})),
        ownerDocument: {},
        getBBox: () => ({x: 0, y: 1, width: 20, height: 12})
    });
    const root = svg('g', {transform: 'translate(100, 200)', id: 'parent-only'}, [
        svg('circle', {cx: '5', cy: '8', r: '3', fill: '#15803d', stroke: 'url(https://example.invalid/x)',
            style: 'fill: red', onclick: 'run()'}),
        svg('text', {x: '12'}, [{nodeType: 3, textContent: '<saved>'}]),
        svg('script'),
        svg('use', {href: 'https://example.invalid/svg#id'}),
        svg('foreignObject', {}, [svg('rect')])
    ]);
    assert.deepEqual(captureNativeFieldDrawing(root), {
        bounds: [0, 1, 20, 12],
        drawing: {tag: 'g', attributes: [], children: [
            {tag: 'circle', attributes: [['cx', '5'], ['cy', '8'], ['r', '3'], ['fill', '#15803d']], children: []},
            {tag: 'text', attributes: [['x', '12']], children: ['<saved>']}
        ]}
    });
    assert.equal(captureNativeFieldDrawing(svg('g', {}, [svg('image')])), undefined);
    assert.equal(captureNativeFieldDrawing({...root, getBBox: () => ({x: 0, y: 0, width: Infinity, height: 0})}), undefined);
});

test('native SVG projection uses computed CSS paint without carrying resource references', () => {
    const root = {
        namespaceURI: 'http://www.w3.org/2000/svg', localName: 'circle', nodeType: 1, childNodes: [],
        attributes: [{name: 'r', value: '4'}, {name: 'fill', value: '#f00'}, {name: 'stroke', value: '#000'}],
        ownerDocument: {defaultView: {getComputedStyle() {
            const values = {fill: 'rgb(12, 34, 56)', stroke: 'url("https://example.invalid/paint")', 'stroke-width': '2px'};
            return {getPropertyValue: name => values[name] ?? ''};
        }}},
        getBBox: () => ({x: 0, y: 0, width: 8, height: 8})
    };
    assert.deepEqual(captureNativeFieldDrawing(root)?.drawing.attributes, [
        ['r', '4'], ['fill', 'rgb(12, 34, 56)'], ['stroke-width', '2']
    ]);
});

test('programmatic field callbacks stay in the parent and accept only a current authorized action', () => {
    const {session, connect, target, vm} = fixture();
    const name = 'field_fixture_caption';
    const opcode = 'fixture_caption';
    const block = target.blocks.getBlock('block');
    Object.assign(block, {opcode, fields: {[name]: {name, value: 'original'}}});
    target.blocks.blocklyListen = event => {block.fields[name].value = event.newValue;};
    let applications = 0;
    const editor = {
        type: 'turbowarp_plus_actions',
        getEditor(value) {
            return {title: value, actions: [{id: 'revise', label: 'Revise', callback() {throw new Error('not data');}}]};
        },
        applyAction(value, action) {
            applications++;
            return `${value}:${action}`;
        }
    };
    vm.runtime._blockInfo = [{id: 'fixture', customFieldTypes: {caption: {
        extendedName: opcode, fieldImplementation: editor, scratchBlocksDefinition: {json: {type: opcode}}
    }}}];
    const a = connect(target);
    const b = connect(target);
    const projection = a.messages.at(-1).extensions;
    assert.deepEqual(structuredClone(projection), projection);
    assert.deepEqual(projection.customFields, [{name, editor: {type: 'turbowarp_plus_actions'}}]);

    a.focus();
    const lease = a.messages.at(-1).lease;
    const field = {request: 1, targetId: target.id, lease, blockId: 'block', name};
    a.send({type: 'field-editor', ...field});
    const panel = a.messages.at(-1);
    assert.deepEqual(panel, {type: 'field-panel', lease, request: 1,
        panel: {title: 'original', actions: [{id: 'revise', label: 'Revise'}]}});
    assert.deepEqual(structuredClone(panel), panel);
    a.send({type: 'field-action', ...field, action: 'unknown'});
    assert.equal(applications, 0);

    a.send({type: 'field-editor', ...field, request: 2});
    a.send({type: 'field-action', ...field, request: 2, action: 'revise'});
    assert.equal(block.fields[name].value, 'original:revise');
    assert.equal(b.messages.at(-1).type, 'update');

    a.send({type: 'edits', targetId: target.id, lease,
        events: [{type: 'change', blockId: 'block', element: 'field', name, newValue: 'bypass'}]});
    assert.equal(block.fields[name].value, 'original:revise');
    a.send({type: 'field-editor', ...field, request: 3});
    b.focus();
    a.send({type: 'field-action', ...field, request: 3, action: 'revise'});
    assert.equal(applications, 1);
    a.send({type: 'release', lease});
    b.send({type: 'step', targetId: target.id, lease: b.messages.at(-1).lease, redo: false});
    assert.equal(target.blocks.getBlock('block').fields[name].value, 'original');
    session.dispose();
});

test('dynamic extension projections use the registered opcode and each supported saved shape', () => {
    const opcode = 'fixture_shape';
    const command = {opcode: 'other', blockType: 'command', text: 'command [AMOUNT]'};
    const reporter = {blockType: 'reporter', text: 'reporter [VALUE]'};
    const branch = {blockType: 'conditional', branchCount: 2, text: ['when', 'otherwise']};
    const unsupported = {blockType: 'conditional', branchCount: -1, text: 'conditional'};
    const category = {id: 'fixture', blocks: [{
        info: {opcode: 'shape', isDynamic: true, blockType: 'command', text: 'default'},
        json: {type: opcode, nextStatement: null}
    }]};
    const block = (blockInfo, type = opcode) => ({opcode: type, mutation: {blockInfo}});
    const target = {blocks: {_blocks: {
        a: block(command), b: block(reporter), duplicate: block(reporter),
        branch: block(branch), unsupported: block(unsupported), unregistered: block(command, 'other_shape')
    }}};
    const calls = [];
    const runtime = {
        _blockInfo: [category],
        _convertBlockForScratchBlocks(info, owner) {
            assert.equal(owner, category);
            calls.push(info);
            return {json: {type: opcode, message0: info.text, ...(info.blockType === 'reporter' ? {output: 'String'} : {
                nextStatement: null
            })}};
        }
    };

    const extensions = getCodeExtensions(runtime, target);
    assert.deepEqual(extensions.definitions, []);
    assert.deepEqual(extensions.dynamicDefaults, [{
        mutation: JSON.stringify(category.blocks[0].info), json: category.blocks[0].json
    }]);
    const shapes = getCodeDynamicShapes(runtime, target);
    assert.deepEqual(shapes, [
        {mutation: JSON.stringify(command), json: {type: opcode, message0: command.text, nextStatement: null}},
        {mutation: JSON.stringify(reporter), json: {type: opcode, message0: reporter.text, output: 'String'}},
        {mutation: JSON.stringify(branch), json: {type: opcode, message0: branch.text, nextStatement: null}}
    ]);
    assert.deepEqual(calls, [command, reporter, branch].map(info => ({...info, opcode: 'shape', isDynamic: true})));
    assert.equal(command.opcode, 'other');
    assert.deepEqual(structuredClone(shapes), shapes);
});

test('the docked factory retains branch mutations and follows GUI extension refreshes', async () => {
    const opcode = 'fixture_shape';
    const category = {blocks: [{info: {isDynamic: true, opcode: 'shape'}, json: {type: opcode}}]};
    const branch = {opcode: 'other', blockType: 'conditional', branchCount: 2, text: ['when', 'otherwise']};
    const layout = {type: opcode, args1: [{type: 'input_statement', name: 'SUBSTACK'}],
        args3: [{type: 'input_statement', name: 'SUBSTACK2'}]};
    const vm = Object.assign(new EventEmitter(), {runtime: {
        _blockInfo: [category],
        _convertBlockForScratchBlocks(info, owner) {
            assert.deepEqual(info, {...branch, opcode: 'shape', isDynamic: true});
            assert.equal(owner, category);
            return {json: {...layout, colour: '#abcd01', extensions: ['from_extension']}};
        }
    }});
    const nativeFactory = () => ({
        domToMutation(mutation) {this.nativeMutation = mutation;},
        mutationToDom() {return this.nativeMutation;}
    });
    const definitions = {};
    const connection = attachDockedCodeExtensions({vm, ScratchBlocks: {Blocks: definitions}});
    definitions[opcode] = nativeFactory();
    await Promise.resolve();

    const instance = {...definitions[opcode], jsonInit(json) {assert.deepEqual(json, layout);}};
    const xml = info => {
        const mutation = {getAttribute: () => JSON.stringify(info), cloneNode: () => xml(info)};
        return mutation;
    };
    const saved = xml(branch);
    instance.domToMutation(saved);
    assert.notEqual(instance.mutationToDom(), saved);
    assert.deepEqual(JSON.parse(instance.mutationToDom().getAttribute()), branch);

    const latest = nativeFactory();
    definitions[opcode] = latest;
    vm.emit('BLOCKSINFO_UPDATE', category);
    const regular = {...definitions[opcode]};
    const command = xml({blockType: 'command', text: 'command'});
    regular.domToMutation(command);
    assert.equal(regular.mutationToDom(), command);
    assert.notEqual(definitions[opcode], latest);
    connection.dispose();
    assert.equal(definitions[opcode], latest);
});

test('procedure edits remove only obsolete slots and their shadows', () => {
    const entries = {
        call: {opcode: 'procedures_call', mutation: {argumentids: '["kept"]'}, inputs: {
            kept: {block: 'keptShadow', shadow: 'keptShadow'},
            removed: {block: null, shadow: 'removedShadow'}
        }},
        keptShadow: {shadow: true, parent: 'call'},
        removedShadow: {shadow: true, parent: null},
        disconnectedValue: {shadow: false, parent: null}
    };
    const deleted = [];
    const blocks = {getBlock: id => entries[id], deleteBlock: id => {deleted.push(id);}, resetCache() {}};

    removeObsoleteProcedureInputs(blocks, new Set(['call']));
    assert.deepEqual(entries.call.inputs, {kept: {block: 'keptShadow', shadow: 'keptShadow'}});
    assert.deepEqual(deleted, ['removedShadow']);
});

test('renaming from the foreground rewrites other targets’ undo and redo references', () => {
    const {session, connect, target, other} = fixture();
    const a = connect(target);
    const b = connect(other);
    const last = view => view.messages.at(-1);
    const step = (view, sprite, lease, redo) =>
        view.send({type: 'step', targetId: sprite.id, lease, redo});
    b.focus();
    const bLease = last(b).lease;
    b.send({type: 'edits', targetId: other.id, lease: bLease,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x: 35, y: 0}}]});
    step(b, other, bLease, false);
    a.focus();
    b.send({type: 'release', lease: bLease});
    const aLease = last(a).lease;
    const rename = name => a.send({type: 'rename-target', targetId: target.id, lease: aLease, name});
    rename(other.name);
    assert.equal(last(a).accepted, false);
    rename('renamed');
    assert.equal(last(a).accepted, true);
    assert.equal(target.name, 'renamed');
    assert.equal(other.blocks._blocks.block.reference, 'renamed');
    b.focus();
    a.send({type: 'release', lease: aLease});
    const nextLease = last(b).lease;
    step(b, other, nextLease, true);
    assert.deepEqual(other.blocks._blocks.block, {x: 35, reference: 'renamed'});
    step(b, other, nextLease, false);
    assert.deepEqual(other.blocks._blocks.block, {x: 0, reference: 'renamed'});
    session.dispose();
});

test('target changes follow only the last active view and drain edits into the old history', () => {
    const {session, connect, target, other, vm, focusParent} = fixture();
    const a = connect(target);
    const b = connect(target);
    const last = view => view.messages.at(-1);
    const select = (view, lease, from, to) =>
        view.send({type: 'select-target', lease, targetId: from.id, nextTargetId: to.id});
    const edit = (view, lease, sprite, x) => view.send({type: 'edits', lease, targetId: sprite.id,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x, y: 0}}]});

    b.focus();
    const oldLease = last(b).lease;
    select(a, oldLease, target, other);
    assert.equal(vm.editingTarget, target);
    select(b, oldLease, target, other);
    assert.equal(last(b).type, 'revoke');
    edit(b, oldLease, target, 21);
    b.send({type: 'release', lease: oldLease});
    assert.equal(vm.editingTarget, other);
    assert.equal(last(a).type, 'update');
    assert.equal(last(b).type, 'grant');
    assert.equal(last(b).canUndo, false);
    assert.equal(other.blocks._blocks.block.x, 0);

    const otherLease = last(b).lease;
    focusParent();
    vm.setEditingTarget(target.id);
    b.send({type: 'edits', lease: otherLease, targetId: other.id,
        events: [{type: 'change', blockId: 'block', element: 'field', name: 'VARIABLE', newValue: 'stale'}]});
    edit(b, otherLease, other, 35);
    b.send({type: 'release', lease: otherLease});
    assert.equal(last(b).targetId, target.id);
    assert.equal(last(b).canUndo, true);
    assert.equal(target.blocks._blocks.block.x, 21);
    assert.equal(other.blocks._blocks.block.x, 35);
    vm.setEditingTarget(other.id);
    assert.equal(last(b).targetId, other.id);
    assert.equal(last(b).canUndo, true);
    assert.equal(a.messages.some(message => message.targetId === other.id), false);
    session.dispose();
});

test('a background drop keeps its target while foreground edits drain', async () => {
    let drop;
    const {session, connect, target, other, vm, node} = fixture(request => {
        drop = request.commit(async () => {
            assert.equal(request.canUse(), true);
            assert.equal(request.target, target);
            assert.equal(vm.editingTarget, other);
            target.blocks._blocks.copied = {x: 40};
            target.blocks._scripts.push('copied');
            return true;
        });
    });
    const a = connect(target);
    const b = connect(other);
    b.focus();
    const lease = b.messages.at(-1).lease;
    const message = {type: 'backpack-drop', raw: 'reference', position: {x: 40, y: 50}};
    a.send({...message, targetId: other.id});
    assert.equal(drop, undefined);
    a.send({...message, targetId: target.id});
    assert.equal(b.messages.at(-1).type, 'revoke');
    assert.equal(target.blocks._blocks.copied, undefined);
    assert.equal(node.inert, true);
    b.send({type: 'edits', lease, targetId: other.id,
        events: [{type: 'move', blockId: 'block', newCoordinate: {x: 20, y: 0}}]});
    b.send({type: 'release', lease});
    assert.equal(await drop, true);
    assert.equal(b.messages.at(-1).type, 'grant');
    assert.equal(vm.editingTarget, other);
    assert.equal(a.messages.at(-1).canUndo, true);

    a.focus();
    b.send({type: 'release', lease: b.messages.at(-1).lease});
    a.send({type: 'step', lease: a.messages.at(-1).lease, targetId: target.id, redo: false});
    assert.deepEqual(target.blocks.getScripts(), ['block']);
    assert.equal(other.blocks._blocks.block.x, 20);
    session.dispose();
});

test('collecting pending edits asks every window and keeps the typing window’s lease', async () => {
    const {session, connect, target, other} = fixture();
    const a = connect(target);
    const b = connect(other);
    a.focus();
    const lease = a.messages.at(-1).lease;
    let collected = false;
    const flushing = session.flush().then(() => {collected = true;});
    const request = a.messages.at(-1);
    assert.equal(request.type, 'flush');
    assert.deepEqual(b.messages.at(-1), request);
    await Promise.resolve();
    assert.equal(collected, false);

    // The child sends its queued edits before confirming on the same ordered port.
    a.send({type: 'edits', lease, targetId: target.id, events: [{type: 'move', blockId: 'block', newCoordinate: {x: 70, y: 0}}]});
    a.send({type: 'flushed', request: request.request});
    a.send({type: 'flushed', request: request.request + 1});
    await Promise.resolve();
    assert.equal(collected, false);
    // A window that closes before answering has nothing left to collect.
    b.close();
    await flushing;
    assert.equal(target.blocks._blocks.block.x, 70);
    assert.equal(a.messages.some(message => message.type === 'revoke'), false);
    session.dispose();
});

test('after a project switch the old windows close and their edits, input and drops are rejected', async () => {
    let drop;
    let applied = false;
    const {session, connect, target, other, vm, node} = fixture(request => {
        drop = request.commit(async () => {
            applied = true;
            return true;
        });
    });
    const a = connect(target);
    const b = connect(other);
    b.focus();
    const lease = b.messages.at(-1).lease;
    a.send({type: 'backpack-drop', targetId: target.id, raw: 'reference', position: {x: 1, y: 2}});
    assert.equal(b.messages.at(-1).type, 'revoke');
    assert.equal(node.inert, true);

    // Loading another project replaces every target object.
    vm.runtime.targets = [];
    vm.runtime.getTargetById = () => undefined;
    vm.editingTarget = undefined;
    vm.emit('targetsUpdate');
    assert.equal(await drop, false);
    assert.equal(applied, false);
    assert.equal(node.inert, false);

    const sent = b.messages.length;
    b.send({type: 'edits', lease, targetId: other.id, events: [{type: 'move', blockId: 'block', newCoordinate: {x: 90, y: 0}}]});
    b.send({type: 'release', lease});
    b.focus();
    a.focus();
    assert.equal(other.blocks._blocks.block.x, 0);
    assert.equal(b.messages.length, sent);
    await session.flush();
    session.dispose();
});
