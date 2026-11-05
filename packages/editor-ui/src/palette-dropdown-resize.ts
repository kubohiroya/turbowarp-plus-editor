import styles from './palette-dropdown-resize.css';

type Size = {width: number; height: number};
type Bounds = Size & {left: number; top: number};
type Drag = {pointerId: number; x: number; y: number; start: Size; size: Size; previousLeft: number | undefined};

const handleSize = 18;
const storageKey = (id: string) => `tw-plus-palette-size:${id}`;

export function attachPaletteDropdownResize(panel: SVGElement, onResize: () => void) {
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
    const unsavedSizes = new Map<string, Size>();
    let categoryId: string | null = null;
    let preferredSize: Size | undefined;
    let bounds: Bounds | null | undefined;
    let drag: Drag | undefined;
    let left: number | undefined;

    const readSize = (id: string): Size | undefined => {
        if (unsavedSizes.has(id)) return unsavedSizes.get(id);
        try {
            const stored = win.localStorage.getItem(storageKey(id));
            if (!stored) return;
            const size: {width?: unknown; height?: unknown} | null = JSON.parse(stored);
            if (size && typeof size.width === 'number' && typeof size.height === 'number' &&
                Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0) {
                return {width: size.width, height: size.height};
            }
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
    const cancelDrag = (event: PointerEvent) => {
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
        open(id: string) {
            categoryId = id;
            preferredSize = readSize(id);
        },
        close() {
            stopDrag();
            categoryId = null;
            preferredSize = undefined;
            bounds = undefined;
            left = undefined;
            handle.hidden = true;
        },
        place(rect: Bounds | null) {
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
        contains(target: Node | null) {
            return handle.contains(target);
        },
        dispose() {
            stopDrag();
            events.abort();
            handle.remove();
        }
    };
}
