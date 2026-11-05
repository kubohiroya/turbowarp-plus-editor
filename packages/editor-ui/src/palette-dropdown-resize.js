import styles from './palette-dropdown-resize.css';

const handleSize = 18;
const storageKey = id => `tw-plus-palette-size:${id}`;

export function attachPaletteDropdownResize(panel, onResize) {
    const doc = panel.ownerDocument;
    const win = doc.defaultView;
    const handle = doc.createElement('div');
    handle.className = styles.handle;
    handle.setAttribute('data-palette-resize-handle', '');
    handle.setAttribute('aria-hidden', 'true');
    handle.style.width = handle.style.height = `${handleSize}px`;
    handle.hidden = true;
    panel.after(handle);

    const events = new AbortController();
    const capture = {capture: true, signal: events.signal};
    const unsavedSizes = new Map();
    let categoryId = null;
    let preferredSize;
    let bounds;
    let drag;
    let left;

    const readSize = id => {
        if (unsavedSizes.has(id)) return unsavedSizes.get(id);
        try {
            const size = JSON.parse(win.localStorage.getItem(storageKey(id)));
            if (size && [size.width, size.height].every(value => Number.isFinite(value) && value > 0)) return size;
        } catch {
            // The saved preference may be malformed or storage unavailable.
        }
    };

    const stopDrag = () => {
        if (!drag) return;
        const {pointerId} = drag;
        drag = undefined;
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };

    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag || categoryId === null || !bounds) return;
        event.preventDefault();
        event.stopPropagation();
        const {width, height} = bounds;
        const start = {width, height};
        drag = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, start, size: start, previousLeft: left};
        left = bounds.left;
        handle.setPointerCapture(event.pointerId);
    }, capture);
    handle.addEventListener('pointermove', event => {
        if (drag?.pointerId !== event.pointerId) return;
        const {start, x, y} = drag;
        drag.size = {
            width: Math.max(Math.min(80, start.width), start.width + event.clientX - x),
            height: Math.max(Math.min(64, start.height), start.height + event.clientY - y)
        };
        onResize();
    }, capture);
    handle.addEventListener('pointerup', event => {
        if (drag?.pointerId !== event.pointerId) return;
        if (bounds && (drag.start.width !== bounds.width || drag.start.height !== bounds.height)) {
            preferredSize = {width: bounds.width, height: bounds.height};
            try {
                win.localStorage.setItem(storageKey(categoryId), JSON.stringify(preferredSize));
                unsavedSizes.delete(categoryId);
            } catch {
                unsavedSizes.set(categoryId, preferredSize);
            }
        } else left = drag.previousLeft;
        stopDrag();
        onResize();
    }, capture);
    const cancelDrag = event => {
        if (drag?.pointerId !== event.pointerId) return;
        left = drag.previousLeft;
        stopDrag();
        onResize();
    };
    handle.addEventListener('pointercancel', cancelDrag, capture);
    handle.addEventListener('lostpointercapture', cancelDrag, capture);

    return {
        get size() {
            return drag?.size ?? preferredSize;
        },
        get left() {
            return left;
        },
        open(id) {
            categoryId = id;
            preferredSize = readSize(id);
        },
        close() {
            stopDrag();
            categoryId = null;
            preferredSize = bounds = left = undefined;
            handle.hidden = true;
        },
        place(rect) {
            bounds = rect;
            handle.hidden = !rect || rect.width < handleSize || rect.height < handleSize;
            if (handle.hidden) return;
            const x = rect.left + rect.width - handleSize;
            const y = rect.top + rect.height - handleSize;
            handle.style.transform = `translate(${x}px, ${y}px)`;
        },
        followAnchor() {
            if (!drag) left = undefined;
        },
        contains(target) {
            return handle.contains(target);
        },
        dispose() {
            stopDrag();
            events.abort();
            handle.remove();
        }
    };
}
