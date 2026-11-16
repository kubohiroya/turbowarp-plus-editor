import assert from 'node:assert/strict';
import {test} from 'node:test';

import {JSDOM} from 'jsdom';

import {attachPaletteCategoryGroups, filterGroupedToolboxTree, flattenCategoryGroups} from
    '../site/palette-category-groups/index.ts';

const toolbox = `<xml>
<category id="motion"><block type="motion_movesteps"/></category>
<category id="media">
  <category id="looks"><block type="looks_show"/></category>
  <category id="sound"><block type="sound_play"/></category>
  <category id="more">
    <category id="events"><block type="event_whenflagclicked"/></category>
    <category><block type="control_wait"/></category>
  </category>
</category>
<category id="operators"><block type="operator_add"/></category>
</xml>`;

const parse = (source: string) => {
    const dom = new JSDOM('<!doctype html><body></body>');
    return {dom, tree: new dom.window.DOMParser().parseFromString(source, 'text/xml').documentElement};
};
const topLevel = (tree: Element) => Array.from(tree.children).map(category =>
    `${category.getAttribute('id')}${category.getAttribute('palette-group-parent') ? `<${category.getAttribute('palette-group-parent')}` : ''}`);

test('nested categories are moved after their group, depth first, and named by the group', () => {
    const {tree} = parse(toolbox);
    const groups = flattenCategoryGroups(tree);
    assert.deepEqual(topLevel(tree),
        ['motion', 'media', 'looks<media', 'sound<media', 'more<media', 'events<more', 'more/1<more', 'operators']);
    assert.deepEqual([...groups.members], [['media', ['looks', 'sound', 'more']], ['more', ['events', 'more/1']]]);
    assert.equal(groups.withOwnContents.size, 0);
    assert.equal(tree.querySelector('category category'), null);
});

test('a filter by id keeps the groups that still have members and drops the empty ones', () => {
    const {tree} = parse(toolbox);
    const groups = flattenCategoryGroups(tree);
    const visible = new Set(['motion', 'looks']);
    const remaining = filterGroupedToolboxTree(tree, groups, filtered => {
        for (const category of Array.from(filtered.querySelectorAll(':scope > category'))) {
            if (!visible.has(category.getAttribute('id')!)) category.remove();
        }
    });
    assert.deepEqual(topLevel(tree), ['motion', 'media', 'looks<media']);
    assert.deepEqual([...remaining.members], [['media', ['looks']]]);
});

test('a group opens its members in a child palette, and a click outside closes it', () => {
    const {dom, tree} = parse(toolbox);
    const doc = dom.window.document;
    const groups = flattenCategoryGroups(tree);
    const wrapper = doc.createElement('div');
    const menu = doc.createElement('div');
    const table = doc.createElement('div');
    table.className = 'scratchCategoryMenu';
    menu.append(table);
    wrapper.append(menu);
    doc.body.append(wrapper);
    const chosen: string[] = [];
    const categories = Array.from(tree.children).map(element => {
        const row = doc.createElement('div');
        const item = doc.createElement('div');
        item.className = `scratchCategoryMenuItem scratchCategoryId-${element.getAttribute('id')}`;
        item.textContent = element.getAttribute('id');
        row.append(item);
        table.append(row);
        return {id_: element.getAttribute('id')!, name_: element.getAttribute('id')!, item_: item, setSelected(selected: boolean) {
            item.classList.toggle('categorySelected', selected);
        }};
    });
    const controller = attachPaletteCategoryGroups(menu, {
        categories: () => categories,
        horizontal: () => true,
        choose: category => chosen.push(category.id_)
    });
    controller.update(groups);
    const byId = (id: string) => categories.find(category => category.id_ === id)!;
    assert.deepEqual(categories.filter(category => !category.item_.parentElement!.hidden).map(category => category.id_),
        ['motion', 'media', 'operators']);
    assert.equal(byId('media').item_.getAttribute('aria-haspopup'), 'true');
    assert.equal(controller.anchorOf(byId('events')), byId('media').item_);

    // Scratch Blocks would open the category on mouseup; a group's icon keeps it to itself.
    let reached = false;
    byId('media').item_.addEventListener('mouseup', () => { reached = true; });
    byId('media').item_.dispatchEvent(new dom.window.MouseEvent('mouseup', {bubbles: true}));
    assert.equal(reached, false);

    const click = (element: Element) => element.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
    const popups = () => Array.from(doc.querySelectorAll('[data-palette-group-popup]'),
        popup => `${popup.getAttribute('data-palette-group-popup')}:${Array.from(popup.children,
            item => item.getAttribute('data-palette-group-item')).join(',')}`);
    click(byId('media').item_);
    assert.deepEqual(popups(), ['media:looks,sound,more']);
    assert.ok(doc.querySelector('[data-palette-group-popup]')!.hasAttribute('data-horizontal'));
    assert.equal(byId('media').item_.getAttribute('aria-expanded'), 'true');

    click(doc.querySelector('[data-palette-group-item="more"]')!);
    assert.deepEqual(popups(), ['media:looks,sound,more', 'more:events,more/1']);

    // Another member of the outer palette closes the inner one.
    click(doc.querySelector('[data-palette-group-item="more"]')!);
    assert.deepEqual(popups(), ['media:looks,sound,more']);
    click(doc.querySelector('[data-palette-group-item="more"]')!);

    click(doc.querySelector('[data-palette-group-item="events"]')!);
    assert.deepEqual(chosen, ['events']);
    assert.deepEqual(popups(), []);
    byId('events').setSelected(true);
    assert.ok(byId('media').item_.classList.contains('categorySelected'));
    assert.ok(byId('media').item_.hasAttribute('data-palette-group-current'));

    click(byId('media').item_);
    assert.equal(controller.isOpen(), true);
    doc.querySelector('[data-palette-group-popup]')!.dispatchEvent(new dom.window.Event('pointerdown', {bubbles: true}));
    assert.equal(controller.isOpen(), true);
    doc.body.dispatchEvent(new dom.window.Event('pointerdown', {bubbles: true}));
    assert.equal(controller.isOpen(), false);
    assert.equal(byId('media').item_.getAttribute('aria-expanded'), 'false');

    // Clicking the group's icon again closes its child palette.
    click(byId('media').item_);
    click(byId('media').item_);
    assert.equal(controller.isOpen(), false);

    click(byId('media').item_);
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert.equal(controller.isOpen(), false);

    controller.dispose();
    click(byId('media').item_);
    assert.equal(controller.isOpen(), false);
});

test('a group with blocks of its own offers them first', () => {
    const {tree} = parse('<xml><category id="g"><block type="a"/><category id="c"><block type="b"/></category></category></xml>');
    const groups = flattenCategoryGroups(tree);
    assert.deepEqual([...groups.withOwnContents], ['g']);
    const remaining = filterGroupedToolboxTree(tree, groups, filtered => {
        filtered.querySelector(':scope > category[id="c"]')?.remove();
    });
    assert.deepEqual([...remaining.members], [['g', []]]);
    assert.deepEqual(topLevel(tree), ['g']);
});
