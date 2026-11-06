type Anchor = {left: number; bottom: number};

/** The widget is created by the parent ScratchBlocks instance. Its DOM and listeners are adopted by the child. */
export function openNativeField({blocks, field, document, anchor, valid, commit, onError}: {
    blocks; field; document: Document; anchor: Anchor; valid(): boolean; commit(value: string): void;
    onError?(error: unknown): void;
}) {
    const widget = blocks.WidgetDiv;
    const original = widget?.DIV;
    const window = document.defaultView;
    if (!window || !original || typeof field?.showEditor_ !== 'function') return;
    const value = field.getValue();
    const setValue = field.setValue;
    const host = document.createElement('div');
    host.className = original.className;
    host.dataset.plusNativeField = '';
    document.body.append(host);
    let closed = false;
    let queued = false;

    function withoutEvents(apply: () => void) {
        blocks.Events.disable();
        try {
            apply();
        } finally {
            blocks.Events.enable();
        }
    }

    function close() {
        if (closed) return;
        closed = true;
        observer.disconnect();
        document.removeEventListener('keydown', escape, true);
        document.removeEventListener('pointerdown', outside, true);
        try {
            if (widget.DIV === host) widget.hide(true);
        } catch (error) {
            onError?.(error);
        } finally {
            if (widget.DIV === host) widget.DIV = original;
            field.setValue = setValue;
            host.remove();
            if (field.sourceBlock_ && field.getValue() !== value) {
                try {
                    withoutEvents(() => setValue.call(field, value));
                } catch (error) {
                    onError?.(error);
                }
            }
        }
    }

    function escape(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
    }

    function outside(event: PointerEvent) {
        if (!host.contains(event.target as Node)) close();
    }

    const observer = new MutationObserver(() => {
        if (!queued && !widget.isVisible()) close();
    });
    try {
        widget.hide(true);
        widget.DIV = host;
        field.setValue = next => {
            if (closed || !valid()) return;
            withoutEvents(() => setValue.call(field, next));
            if (queued || field.getValue() === value) return;
            queued = true;
            queueMicrotask(() => {
                if (closed) return;
                const result = field.getValue();
                try {
                    const accepted = valid() && typeof result === 'string' && result !== value;
                    close();
                    if (accepted) commit(result);
                } catch (error) {
                    onError?.(error);
                }
            });
        };
        field.showEditor_();
        if (!widget.isVisible() || !host.childElementCount) {
            close();
            return;
        }
        host.style.position = 'fixed';
        host.style.left = `${Math.max(0, Math.min(anchor.left, window.innerWidth - host.offsetWidth))}px`;
        host.style.top = `${Math.max(0, Math.min(anchor.bottom, window.innerHeight - host.offsetHeight))}px`;
        observer.observe(host, {attributes: true, attributeFilter: ['style']});
        document.addEventListener('keydown', escape, true);
        document.addEventListener('pointerdown', outside, true);
        return close;
    } catch (error) {
        close();
        onError?.(error);
    }
}
