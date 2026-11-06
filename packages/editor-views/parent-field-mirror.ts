const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const elements = new Set(['div', 'span', 'p', 'fieldset', 'legend', 'label', 'textarea', 'input', 'button']);
const inputTypes = new Set(['text', 'number', 'range']);
const attributes = ['aria-label', 'title', 'placeholder', 'min', 'max', 'step', 'maxlength'];

const sides = ['top', 'right', 'bottom', 'left'];
const colors = ['color', 'background-color', ...sides.map(side => `border-${side}-color`)];
const lengths = ['font-size', 'line-height', ...sides.flatMap(side => [`padding-${side}`, `border-${side}-width`]),
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
const borderStyles = sides.map(side => `border-${side}-style`);
const typography = ['font-family', 'font-style', 'font-weight'];
const length = /^\d+(?:\.\d+)?px$/;
const color = /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i;
const generatedText = /^(?:"[^"\\\x00-\x1f]{0,120}"|none|normal)$/;
const stateSelector = /^\.([\w-]+)(:hover|:focus|:focus-visible)(::before|::after)?$/;
const pseudoElements = ['::before', '::after'];

function copyAppearance(source: CSSStyleDeclaration, target: CSSStyleDeclaration, {pseudo = false, priority = ''} = {}) {
    const copy = (name: string, accept: (value: string) => boolean) => {
        const value = source.getPropertyValue(name);
        const safe = value.length <= 128 && accept(value) ? value : '';
        if (target.getPropertyValue(name) !== safe) target.setProperty(name, safe, priority);
    };
    for (const name of colors) copy(name, value => color.test(value));
    for (const name of lengths) copy(name, value => (name === 'line-height' && value === 'normal') ||
        (length.test(value) && Number.parseFloat(value) <= 128));
    for (const name of borderStyles) copy(name, value => /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/.test(value));
    for (const name of typography) copy(name, value => {
        if (name === 'font-family') return /^[\w ,'"-]+$/.test(value);
        if (name === 'font-style') return /^(normal|italic|oblique)$/.test(value);
        return /^(normal|bold|[1-9]00)$/.test(value);
    });
    if (pseudo) copy('content', value => generatedText.test(value));
}

function readStateRules(document: Document) {
    const rules: {className: string; state: string; pseudo: string; style: CSSStyleDeclaration}[] = [];
    for (const sheet of document.styleSheets) {
        if (sheet.disabled || (sheet.media.mediaText && !document.defaultView?.matchMedia(sheet.media.mediaText).matches)) continue;
        let source: CSSRuleList;
        try {
            source = sheet.cssRules;
        } catch {
            continue; // Cross-origin stylesheets are opaque.
        }
        for (const rule of source) {
            if (rule.type !== 1) continue;
            const {selectorText, style} = rule as CSSStyleRule;
            const match = stateSelector.exec(selectorText);
            if (match) rules.push({className: match[1], state: match[2], pseudo: match[3] ?? '', style});
        }
    }
    return rules;
}

function mirrorWidgetStyles(parent: Window, host: HTMLElement, nodes: [HTMLElement, HTMLElement][]) {
    const style = host.ownerDocument.createElement('style');
    host.append(style);
    const sheet = style.sheet;
    if (!sheet) return () => {};
    const stateRules = readStateRules(parent.document);
    const refresh: (() => void)[] = [];
    nodes.forEach(([original, proxy], index) => {
        proxy.dataset.plusNativeFieldNode = String(index);
        const selector = `[data-plus-native-field] [data-plus-native-field-node="${index}"]`;
        const add = (suffix: string) => {
            const index = sheet.insertRule(`${selector}${suffix} {}`, sheet.cssRules.length);
            return (sheet.cssRules[index] as CSSStyleRule).style;
        };
        for (const pseudo of pseudoElements) {
            let target: CSSStyleDeclaration | undefined;
            refresh.push(() => {
                const computed = parent.getComputedStyle(original, pseudo);
                if (!target && (!generatedText.test(computed.content) || !computed.content.startsWith('"'))) return;
                target ??= add(pseudo);
                copyAppearance(computed, target, {pseudo: true});
            });
        }
        for (const {className, state, pseudo, style} of stateRules) {
            if (!original.classList.contains(className)) continue;
            // Override the inline baseline while letting the child browser resolve the state.
            copyAppearance(style, add(state + pseudo), {pseudo: Boolean(pseudo), priority: 'important'});
        }
    });
    return () => {for (const update of refresh) update();};
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/** The parent's widget remains authoritative, including its document-level handlers. */
export function mirrorParentField(source: HTMLElement, host: HTMLElement, valid: () => boolean) {
    const parent = source.ownerDocument.defaultView;
    if (!parent) return false;
    const sync: (() => void)[] = [];
    const nodes: [HTMLElement, HTMLElement][] = [];
    let remaining = 128;
    let controls = 0;

    function mirror(node: Node, depth: number): Node | undefined {
        if (remaining <= 0 || depth > 8) return;
        remaining--;
        if (node.nodeType === 3) {
            const copy = host.ownerDocument.createTextNode('');
            sync.push(() => {copy.data = (node.textContent ?? '').slice(0, 1024);});
            return copy;
        }
        if (node.nodeType !== 1) return;
        const original = node as HTMLElement;
        const tag = original.localName;
        if (original.namespaceURI !== htmlNamespace || !elements.has(tag)) return;
        if (tag === 'input' && !inputTypes.has((original as HTMLInputElement).type)) return;
        if (tag === 'button' && (original as HTMLButtonElement).form && (original as HTMLButtonElement).type !== 'button') return;
        const proxy = host.ownerDocument.createElement(tag);
        nodes.push([original, proxy]);
        sync.push(() => {
            proxy.hidden = original.hidden;
            copyAppearance(parent.getComputedStyle(original), proxy.style);
        });
        for (const name of attributes) {
            const value = original.getAttribute(name);
            if (value !== null) proxy.setAttribute(name, value.slice(0, 1024));
        }
        const canRelay = () => valid() && source.contains(original);
        if (tag === 'input' || tag === 'textarea') {
            controls++;
            const control = original as TextControl;
            const copy = proxy as TextControl;
            if (tag === 'input') (copy as HTMLInputElement).type = (control as HTMLInputElement).type;
            sync.push(() => {
                copy.disabled = control.disabled;
                copy.readOnly = control.readOnly;
                if (copy.value !== control.value) copy.value = control.value;
            });
            for (const type of ['input', 'change']) {
                copy.addEventListener(type, event => {
                    if (!canRelay() || control.disabled || control.readOnly) return;
                    control.value = copy.value;
                    const input = event as InputEvent;
                    control.dispatchEvent(type === 'input' ? new parent.InputEvent(type, {
                        bubbles: true, data: input.data, inputType: input.inputType, isComposing: input.isComposing
                    }) : new parent.Event(type, {bubbles: true}));
                    refresh();
                });
            }
        } else {
            if (tag === 'button') {
                controls++;
                const button = proxy as HTMLButtonElement;
                const control = original as HTMLButtonElement;
                button.type = 'button';
                sync.push(() => {button.disabled = control.disabled;});
                button.addEventListener('click', () => {
                    if (!canRelay() || control.disabled) return;
                    original.dispatchEvent(new parent.MouseEvent('click', {bubbles: true, cancelable: true}));
                    refresh();
                });
            }
            if (tag === 'fieldset') sync.push(() => {
                (proxy as HTMLFieldSetElement).disabled = (original as HTMLFieldSetElement).disabled;
            });
            for (const child of original.childNodes) {
                const copy = mirror(child, depth + 1);
                if (copy) proxy.append(copy);
            }
        }
        return proxy;
    }

    function refresh() {
        for (const update of sync) update();
    }

    for (const node of source.childNodes) {
        const copy = mirror(node, 0);
        if (copy) host.append(copy);
    }
    if (!controls) return false;
    sync.push(mirrorWidgetStyles(parent, host, nodes));
    refresh();
    return true;
}
