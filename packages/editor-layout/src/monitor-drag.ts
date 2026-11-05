export function attachExternalMonitorDrag(element: HTMLElement,
    onMove: (event: PointerEvent, position: {x: number; y: number}) => void,
    isDraggable: () => boolean, editorDocument: Document) {
    let drag: {
        id: number; owner: Document; clientX: number; clientY: number;
        scaleX: number; scaleY: number; left: number; top: number;
        offsetLeft: number; offsetTop: number;
        minX: number; minY: number; maxX: number; maxY: number; translate: string;
    } | undefined;

    function clear() {
        if (!drag) return;
        const {id, translate} = drag;
        drag = undefined;
        element.style.translate = translate;
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }

    function start(event: PointerEvent) {
        const owner = element.ownerDocument;
        if (drag || owner === editorDocument || event.pointerType !== 'mouse' || event.button !== 0 ||
            !isDraggable() || (event.target as Element).closest?.('.no-drag')) return;
        const overlay = element.closest('.monitor-overlay');
        if (!overlay || !overlay.clientWidth || !overlay.clientHeight) return;
        const rect = overlay.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const scaleX = rect.width / overlay.clientWidth;
        const scaleY = rect.height / overlay.clientHeight;
        const monitorRect = element.getBoundingClientRect();
        const left = Math.round((monitorRect.left - rect.left) / scaleX);
        const top = Math.round((monitorRect.top - rect.top) / scaleY);
        drag = {
            id: event.pointerId, owner, clientX: event.clientX, clientY: event.clientY,
            scaleX, scaleY, left, top, offsetLeft: element.offsetLeft, offsetTop: element.offsetTop,
            minX: -left, minY: -top,
            maxX: overlay.clientWidth - element.offsetWidth - left,
            maxY: overlay.clientHeight - element.offsetHeight - top,
            translate: element.style.translate
        };
        element.setPointerCapture(drag.id);
        // Stop the compatibility mousedown from starting the in-editor drag path.
        event.preventDefault();
    }

    function offset(event: PointerEvent) {
        const x = Math.round((event.clientX - drag.clientX) / drag.scaleX);
        const y = Math.round((event.clientY - drag.clientY) / drag.scaleY);
        return {
            x: Math.max(drag.minX, Math.min(drag.maxX, x)),
            y: Math.max(drag.minY, Math.min(drag.maxY, y))
        };
    }

    function move(event: PointerEvent) {
        if (drag?.id !== event.pointerId) return;
        if (drag.owner !== element.ownerDocument) return clear();
        const {x, y} = offset(event);
        element.style.translate = `${x}px ${y}px`;
    }

    function finish(event: PointerEvent) {
        if (drag?.id !== event.pointerId) return;
        const position = event.type === 'pointerup' && drag.owner === element.ownerDocument && offset(event);
        const {left, top, offsetLeft, offsetTop} = drag;
        clear();
        if (!position || !(position.x || position.y)) return;
        onMove(event, {x: left + position.x - offsetLeft, y: top + position.y - offsetTop});
        // Keep the editor's existing drag transform and update only the layout position.
        element.style.left = `${offsetLeft + position.x}px`;
        element.style.top = `${offsetTop + position.y}px`;
    }

    const handlers = {pointerdown: start, pointermove: move, pointerup: finish,
        pointercancel: finish, lostpointercapture: finish};
    for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler);
    return () => {
        for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler);
        clear();
    };
}
