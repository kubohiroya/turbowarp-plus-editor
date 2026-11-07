import styles from './palette-category-reorder.css';

const holdDelay = 500;
const movementThreshold = 8;

type Press = {pointerId: number; source: HTMLElement; x: number; y: number; timer: number};

export function attachPaletteCategoryReorder(
    menu: HTMLElement, getItems: () => HTMLElement[], onDrop: (from: number, to: number) => void
) {
    const doc = menu.ownerDocument;
    const win = doc.defaultView;
    const events = new AbortController();
    const capture = {capture: true, signal: events.signal};
    let press: Press | undefined;
    let preview: HTMLElement | undefined;
    let suppressRelease = false;
    let target: HTMLElement | undefined;

    const markTarget = (item?: HTMLElement) => {
        target?.removeAttribute('data-palette-reorder-target');
        target = item === press?.source ? undefined : item;
        target?.setAttribute('data-palette-reorder-target', '');
    };

    const cancel = () => {
        if (!press) return;
        const {pointerId, source, timer} = press;
        win.clearTimeout(timer);
        markTarget();
        press = undefined;
        preview?.remove();
        preview = undefined;
        source.removeAttribute('data-palette-reorder-source');
        menu.classList.remove(styles.reordering);
        menu.removeAttribute('data-palette-reordering');
        if (menu.hasPointerCapture(pointerId)) menu.releasePointerCapture(pointerId);
    };

    const itemAt = (event: PointerEvent, items: HTMLElement[]) => {
        const hit = doc.elementFromPoint(event.clientX, event.clientY);
        if (!items.length || !menu.contains(hit)) return;
        const item = items.find(candidate => candidate.parentElement.contains(hit));
        if (item) return item;

        const first = items[0];
        const last = items[items.length - 1];
        const start = first.getBoundingClientRect();
        const end = last.getBoundingClientRect();
        if (!menu.hasAttribute('data-horizontal-block-palette')) {
            if (event.clientY < start.top) return first;
            if (event.clientY > end.bottom) return last;
        } else if (menu.dir === 'rtl') {
            if (event.clientX > start.right) return first;
            if (event.clientX < end.left) return last;
        } else {
            if (event.clientX < start.left) return first;
            if (event.clientX > end.right) return last;
        }
    };

    doc.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        cancel();
        suppressRelease = false;
        if (event.ctrlKey || !menu.contains(event.target as Node)) return;
        const source = getItems().find(item => item.contains(event.target as Node));
        if (!source) return;
        const {pointerId, clientX: x, clientY: y} = event;
        const timer = win.setTimeout(() => {
            if (!getItems().includes(source)) return cancel();
            try {
                menu.setPointerCapture(pointerId);
            } catch {
                // The pointer may have been released outside the browser during the hold.
                return cancel();
            }
            const {left, top, width, height} = source.getBoundingClientRect();
            const {backgroundColor, color, direction, font, padding, whiteSpace} = win.getComputedStyle(source);
            preview = source.cloneNode(true) as HTMLElement;
            preview.classList.add(styles.dragPreview);
            preview.setAttribute('data-palette-reorder-preview', '');
            preview.inert = true;
            Object.assign(preview.style, {
                left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
                backgroundColor: backgroundColor === 'rgba(0, 0, 0, 0)' ?
                    win.getComputedStyle(menu).backgroundColor : backgroundColor,
                color, direction, font, padding, whiteSpace
            });
            // Mount outside the toolbox so its scrolling and clipping don't constrain the preview.
            doc.body.append(preview);
            suppressRelease = true;
            menu.classList.add(styles.reordering);
            menu.setAttribute('data-palette-reordering', '');
            source.setAttribute('data-palette-reorder-source', '');
        }, holdDelay);
        press = {pointerId, source, x, y, timer};
    }, capture);

    doc.addEventListener('pointermove', event => {
        if (press?.pointerId !== event.pointerId) return;
        if (preview) {
            preview.style.transform = `translate(${event.clientX - press.x}px, ${event.clientY - press.y}px)`;
            markTarget(itemAt(event, getItems()));
        }
        else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > movementThreshold) cancel();
    }, capture);

    doc.addEventListener('pointerup', event => {
        if (press?.pointerId !== event.pointerId) return;
        if (!preview) return cancel();
        const items = getItems();
        const from = items.indexOf(press.source);
        const to = items.indexOf(itemAt(event, items));
        cancel();
        if (from >= 0 && to >= 0 && from !== to) onDrop(from, to);
    }, capture);

    doc.addEventListener('pointercancel', event => {
        if (press?.pointerId === event.pointerId) cancel();
    }, capture);
    menu.addEventListener('lostpointercapture', event => {
        if (event.target === menu && press?.pointerId === event.pointerId) cancel();
    }, capture);
    win.addEventListener('blur', cancel, capture);
    doc.addEventListener('keydown', event => {
        if (!preview || event.key !== 'Escape') return;
        event.stopImmediatePropagation();
        cancel();
    }, capture);

    // ScratchBlocks selects categories on mouseup or touchend. Ignore the release of a reorder.
    const swallowRelease = (event: Event) => {
        if (!suppressRelease) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    menu.addEventListener('mouseup', swallowRelease, capture);
    menu.addEventListener('touchend', swallowRelease, {...capture, passive: false});
    menu.addEventListener('touchmove', event => {
        if (preview) event.preventDefault();
    }, {...capture, passive: false});
    doc.addEventListener('contextmenu', event => {
        if (!press || !menu.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, capture);

    return {
        cancel,
        dispose() {
            cancel();
            events.abort();
        }
    };
}
