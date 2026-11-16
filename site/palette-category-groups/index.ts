import styles from './groups.css';

/**
 * Block palette groups: a category of the toolbox XML that holds other categories is a group. Scratch Blocks
 * reads only the top-level categories and drops nested ones, so the tree is flattened before it is drawn:
 * each nested category becomes a top-level one right after its group, and the menu hides it. Clicking the
 * group's icon then shows its members in a child palette laid out like the palette it opens from — a row to the
 * right of the icon for a horizontal palette, a column below it for a vertical one — and a member that is itself
 * a group opens the next level the same way. A click outside the child palettes closes them.
 */

/** The attribute a flattened category keeps with the id of the group it was nested in. */
export const groupParentAttribute = 'palette-group-parent';

export interface PaletteGroups {
    /** Each group's members, in order, by category id. A member may itself be a group. */
    members: Map<string, string[]>;
    /** The groups that also hold blocks of their own, which their child palette offers first. */
    withOwnContents: Set<string>;
}

const isCategory = (node: Node): node is Element =>
    node.nodeType === 1 && (node as Element).tagName.toLowerCase() === 'category';
const ownsContents = (category: Element) => Array.from(category.children).some(child => !isCategory(child));

/**
 * Moves every nested category of the toolbox tree to the top level, right after the group that held it, depth
 * first, so Scratch Blocks makes a category of each. Returns the groups found. A nested category without an id
 * gets one from its group's id and its position.
 */
export const flattenCategoryGroups = (tree: Element | null | undefined): PaletteGroups => {
    const groups: PaletteGroups = {members: new Map(), withOwnContents: new Set()};
    if (!tree) return groups;
    const used = new Set(Array.from(tree.querySelectorAll('category[id]'), category => category.getAttribute('id')));
    const flatten = (category: Element, after: Element): Element => {
        const nested = Array.from(category.children).filter(isCategory);
        if (!nested.length) return after;
        const id = category.getAttribute('id')!;
        groups.members.set(id, []);
        if (ownsContents(category)) groups.withOwnContents.add(id);
        let last = after;
        nested.forEach((child, index) => {
            if (!child.getAttribute('id')) {
                let generated = `${id}/${index}`;
                while (used.has(generated)) generated += '_';
                used.add(generated);
                child.setAttribute('id', generated);
            }
            child.setAttribute(groupParentAttribute, id);
            groups.members.get(id)!.push(child.getAttribute('id')!);
            last.after(child);
            last = flatten(child, child);
        });
        return last;
    };
    for (const category of Array.from(tree.children).filter(isCategory)) {
        if (!category.getAttribute('id')) continue;
        flatten(category, category);
    }
    return groups;
};

/**
 * Runs a filter that removes top-level categories by id on a flattened tree, without letting it remove a group
 * that still has a member left, then removes the groups left empty. Returns the groups that remain.
 */
export const filterGroupedToolboxTree = (tree: Element, groups: PaletteGroups, filter: (tree: Element) => void):
    PaletteGroups => {
    const held = Array.from(tree.children).filter(child => isCategory(child) && groups.members.has(child.getAttribute('id')!));
    const markers = held.map(group => {
        const marker = tree.ownerDocument.createComment('palette-group');
        group.replaceWith(marker);
        return marker;
    });
    filter(tree);
    markers.forEach((marker, index) => marker.replaceWith(held[index]));
    const present = new Set(Array.from(tree.children).filter(isCategory).map(category => category.getAttribute('id')));
    const remaining: PaletteGroups = {members: new Map(), withOwnContents: new Set()};
    // A group stays while a member or blocks of its own stay.
    const keep = (id: string): boolean => {
        const members = groups.members.get(id);
        if (!members) return present.has(id);
        const kept = members.filter(keep);
        if (!kept.length && !groups.withOwnContents.has(id)) return false;
        remaining.members.set(id, kept);
        if (groups.withOwnContents.has(id)) remaining.withOwnContents.add(id);
        return true;
    };
    for (const group of held) {
        if (!group.hasAttribute(groupParentAttribute)) keep(group.getAttribute('id')!);
    }
    for (const group of held) {
        if (!remaining.members.has(group.getAttribute('id')!)) group.remove();
    }
    return remaining;
};

/** The part of a Scratch Blocks toolbox category the child palettes use. */
export interface PaletteCategory {
    id_: string;
    name_: string;
    item_: HTMLElement;
    setSelected(selected: boolean): void;
}

export interface PaletteCategoryGroupsOptions {
    /** The toolbox's categories, top level and flattened members alike. */
    categories(): PaletteCategory[];
    /** Whether the palette is laid out in a row. */
    horizontal(): boolean;
    rtl?: boolean;
    /** Opens a category that is not a group, as clicking its icon in the palette would. */
    choose(category: PaletteCategory): void;
    /** Called when a child palette opens or the last one closes. */
    onChange?(): void;
}

export interface PaletteCategoryGroupsController {
    /** Takes the groups of the toolbox just drawn: hides their members' icons and marks the groups' icons. */
    update(groups: PaletteGroups): void;
    isGroup(id: string): boolean;
    /** The id of the outermost group the category is in, or its own id when it is in none. */
    topLevelId(id: string): string;
    /** Opens the group's child palette from its icon, or closes it if it is open. */
    toggle(category: PaletteCategory, focus?: boolean): void;
    isOpen(): boolean;
    /** The icon the palette shows for the category: its own, or that of the group it is in. */
    anchorOf(category: PaletteCategory): HTMLElement;
    /** Whether the node is in a child palette. */
    contains(node: Node | null): boolean;
    close(): void;
    dispose(): void;
}

const selectedClass = 'categorySelected';

/** Makes clicking a group's icon in the palette menu open its child palette. */
export const attachPaletteCategoryGroups = (menu: HTMLElement, options: PaletteCategoryGroupsOptions):
    PaletteCategoryGroupsController => {
    const doc = menu.ownerDocument;
    const events = new doc.defaultView!.AbortController();
    const capture = {capture: true, signal: events.signal};
    let groups: PaletteGroups = {members: new Map(), withOwnContents: new Set()};
    const parentOf = new Map<string, string>();
    // The open child palettes, outermost first, with the icon each opened from.
    const stack: {id: string; anchor: HTMLElement; popup: HTMLElement}[] = [];
    let selected: string | null = null;

    const categoryById = (id: string) => options.categories().find(category => category.id_ === id);
    const topLevelOf = (id: string) => {
        let current = id;
        while (parentOf.has(current)) current = parentOf.get(current)!;
        return current;
    };
    const addClass = (element: Element, name: string) => {
        if (styles[name]) element.classList.add(styles[name]);
    };

    const markSelection = () => {
        for (const [id] of groups.members) {
            if (parentOf.has(id)) continue;
            const item = categoryById(id)?.item_;
            if (!item) continue;
            const current = selected !== null && selected !== id && topLevelOf(selected) === id;
            item.toggleAttribute('data-palette-group-current', current);
            if (current) item.classList.add(selectedClass);
            else if (selected !== id) item.classList.remove(selectedClass);
        }
    };

    const closeFrom = (depth: number) => {
        let changed = false;
        while (stack.length > depth) {
            const {anchor, popup} = stack.pop()!;
            anchor.setAttribute('aria-expanded', 'false');
            popup.remove();
            changed = true;
        }
        if (changed) options.onChange?.();
    };
    const close = () => closeFrom(0);

    const place = (popup: HTMLElement, anchor: HTMLElement) => {
        const container = popup.offsetParent as HTMLElement | null ?? popup.parentElement!;
        const bounds = container.getBoundingClientRect();
        const rect = anchor.getBoundingClientRect();
        const width = popup.offsetWidth;
        const height = popup.offsetHeight;
        const maxLeft = Math.max(0, container.clientWidth - width);
        const maxTop = Math.max(0, container.clientHeight - height);
        let left: number;
        let top: number;
        if (options.horizontal()) {
            left = (options.rtl ? rect.left - width : rect.right) - bounds.left;
            top = rect.top - bounds.top;
        } else {
            left = (options.rtl ? rect.right - width : rect.left) - bounds.left;
            top = rect.bottom - bounds.top;
        }
        popup.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
        popup.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
    };

    const activate = (category: PaletteCategory, entry: HTMLElement, depth: number, focus: boolean, self: boolean) => {
        if (!self && groups.members.has(category.id_)) {
            if (stack[depth]?.id === category.id_) closeFrom(depth);
            else open(category, entry, depth, focus);
            return;
        }
        close();
        options.choose(category);
    };

    const createEntry = (category: PaletteCategory, depth: number, self = false) => {
        const entry = doc.createElement('div');
        entry.className = `scratchCategoryMenuItem scratchCategoryId-${category.id_}`;
        addClass(entry, 'item');
        entry.setAttribute('data-palette-group-item', category.id_);
        entry.setAttribute('role', 'menuitem');
        entry.tabIndex = -1;
        for (const child of Array.from(category.item_.children)) entry.append(child.cloneNode(true));
        const isGroup = !self && groups.members.has(category.id_);
        if (isGroup) {
            entry.setAttribute('aria-haspopup', 'true');
            entry.setAttribute('aria-expanded', 'false');
        }
        if (selected === category.id_ || (isGroup && selected !== null && isInside(selected, category.id_))) {
            entry.classList.add(selectedClass);
        }
        entry.addEventListener('click', event => {
            event.stopPropagation();
            activate(category, entry, depth, false, self);
        }, {signal: events.signal});
        entry.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                activate(category, entry, depth, true, self);
                return;
            }
            const forward = options.horizontal() ? (options.rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
            const backward = options.horizontal() ? (options.rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
            if (event.key !== forward && event.key !== backward) return;
            event.preventDefault();
            const entries = Array.from(entry.parentElement!.children) as HTMLElement[];
            const index = entries.indexOf(entry) + (event.key === forward ? 1 : -1);
            entries[(index + entries.length) % entries.length].focus();
        }, {signal: events.signal});
        return entry;
    };

    const isInside = (id: string, groupId: string) => {
        for (let current: string | undefined = id; current !== undefined; current = parentOf.get(current)) {
            if (current === groupId) return true;
        }
        return false;
    };

    const open = (group: PaletteCategory, anchor: HTMLElement, depth: number, focus: boolean) => {
        closeFrom(depth);
        const members = (groups.members.get(group.id_) ?? []).map(categoryById).filter(Boolean) as PaletteCategory[];
        const popup = doc.createElement('div');
        addClass(popup, 'popup');
        popup.setAttribute('data-palette-group-popup', group.id_);
        popup.setAttribute('role', 'menu');
        popup.setAttribute('aria-label', anchor.textContent?.trim() || group.id_);
        popup.toggleAttribute('data-horizontal', options.horizontal());
        // The child palette is drawn in the palette's own colours and type.
        const look = doc.defaultView!.getComputedStyle(menu.querySelector('.scratchCategoryMenu, .scratchCategoryMenuHorizontal') ?? menu);
        popup.style.setProperty('--palette-group-background', look.backgroundColor);
        popup.style.color = look.color;
        popup.style.fontSize = look.fontSize;
        popup.style.fontFamily = look.fontFamily;
        if (groups.withOwnContents.has(group.id_)) popup.append(createEntry(group, depth, true));
        for (const member of members) popup.append(createEntry(member, depth + 1));
        (menu.parentElement ?? doc.body).append(popup);
        place(popup, anchor);
        anchor.setAttribute('aria-expanded', 'true');
        stack.push({id: group.id_, anchor, popup});
        options.onChange?.();
        if (focus) (popup.firstElementChild as HTMLElement | null)?.focus();
    };

    const toggle = (category: PaletteCategory, focus = false) => {
        if (stack[0]?.id === category.id_) close();
        else open(category, category.item_, 0, focus);
    };

    const groupItem = (target: EventTarget | null) => {
        if (!(target instanceof doc.defaultView!.Node)) return null;
        return options.categories().find(category => groups.members.has(category.id_) &&
            !parentOf.has(category.id_) && category.item_.contains(target as Node)) ?? null;
    };
    // Scratch Blocks opens a category on mouseup (touchend on touch screens); a group opens its child palette on click.
    for (const type of ['mouseup', 'touchend']) {
        menu.addEventListener(type, event => {
            if (groupItem(event.target)) event.stopPropagation();
        }, capture);
    }
    menu.addEventListener('click', event => {
        const category = groupItem(event.target);
        if (!category) return;
        event.stopPropagation();
        toggle(category);
    }, capture);

    const contains = (node: Node | null) => !!node && stack.some(({popup}) => popup.contains(node));
    const onPointerDown = (event: PointerEvent) => {
        if (!stack.length) return;
        const target = event.target as Node | null;
        if (contains(target) || stack[0].anchor.contains(target)) return;
        close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.isComposing || !stack.length) return;
        event.preventDefault();
        // The palette's own Escape would close the block list as well.
        event.stopImmediatePropagation();
        const {anchor} = stack[stack.length - 1];
        closeFrom(stack.length - 1);
        anchor.focus();
    };
    doc.addEventListener('pointerdown', onPointerDown, capture);
    doc.addEventListener('keydown', onKeyDown, capture);
    menu.addEventListener('scroll', close, {signal: events.signal});
    doc.defaultView!.addEventListener('resize', close, {signal: events.signal});

    return {
        update(next) {
            close();
            groups = next;
            parentOf.clear();
            for (const [id, members] of groups.members) for (const member of members) parentOf.set(member, id);
            for (const category of options.categories()) {
                const member = parentOf.has(category.id_);
                const row = category.item_.parentElement;
                if (row && row !== menu) row.hidden = member;
                const group = groups.members.has(category.id_) && !member;
                if (group) {
                    category.item_.setAttribute('aria-haspopup', 'true');
                    category.item_.setAttribute('aria-expanded', 'false');
                    category.item_.setAttribute('data-palette-group', '');
                    addClass(category.item_, 'group');
                }
                const {setSelected} = category;
                category.setSelected = function (value: boolean) {
                    setSelected.call(this, value);
                    if (value) selected = category.id_;
                    else if (selected === category.id_) selected = null;
                    markSelection();
                };
                if (category.item_.classList.contains(selectedClass)) selected = category.id_;
            }
            markSelection();
        },
        isGroup: id => groups.members.has(id) && !parentOf.has(id),
        topLevelId: topLevelOf,
        toggle,
        isOpen: () => stack.length > 0,
        anchorOf: category => categoryById(topLevelOf(category.id_))?.item_ ?? category.item_,
        contains,
        close,
        dispose() {
            close();
            events.abort();
        }
    };
};
