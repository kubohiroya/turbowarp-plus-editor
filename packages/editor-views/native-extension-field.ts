import {mirrorParentField} from './parent-field-mirror.ts';
import type {FieldResourceOptions} from './parent-field-resources.ts';

type Anchor = {left: number; bottom: number};

/** The capability belongs to one popup editor invocation. */
export type NativeFieldEditSession = {
    signal: AbortSignal;
    commit(value: string): void;
};

/** The parent field owns the widget and its value. */
export function openNativeField({blocks, field, document, anchor, parentDocument = false, asyncCommit = false, isolatedValue,
    onAttachedClose, resources, valid, commit, onError}: {
    blocks; field; document: Document; anchor: Anchor; parentDocument?: boolean; asyncCommit?: boolean; isolatedValue?: string;
    resources?: FieldResourceOptions;
    valid(): boolean; commit(value: string): void;
    onAttachedClose?(): void;
    onError?(error: unknown): void;
}) {
    const widget = blocks.WidgetDiv;
    const original = widget?.DIV;
    const window = document.defaultView;
    if (!window || !original || typeof field?.showEditor_ !== 'function') {
        onAttachedClose?.();
        return;
    }
    const isolated = isolatedValue !== undefined;
    const oneUse = isolated || Boolean(onAttachedClose);
    const value = isolated ? isolatedValue : field.getValue();
    const setValue = field.setValue;
    const host = document.createElement('div');
    host.className = original.className;
    host.dataset.plusNativeField = '';
    const widgetHost = parentDocument ? original : host;
    const originalOpacity = original.style.opacity;
    const originalInert = original.inert;
    let ownsWidget = false;
    let widgetOwner;
    let disposeMirror: (() => void) | undefined;
    document.body.append(host);
    let closed = false;
    let queued = false;
    const editController = parentDocument && asyncCommit ? new AbortController() : undefined;
    const scoped = Boolean(editController || oneUse);

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
        if (scoped) {
            window.removeEventListener('blur', close);
            window.removeEventListener('pagehide', close);
            editController?.abort();
        }
        try {
            if (ownsWidget && widget.DIV === widgetHost && (!parentDocument || widget.owner_ === widgetOwner)) widget.hide(true);
        } catch (error) {
            onError?.(error);
        } finally {
            disposeMirror?.();
            if (!parentDocument && widget.DIV === host) widget.DIV = original;
            if (parentDocument && ownsWidget) {
                original.style.opacity = originalOpacity;
                original.inert = originalInert;
            }
            field.setValue = oneUse ? () => {} : setValue;
            host.remove();
            if (isolated) {
                try {
                    field.dispose?.();
                } catch (error) {
                    onError?.(error);
                }
            } else if (field.sourceBlock_ && field.getValue() !== value) {
                try {
                    withoutEvents(() => setValue.call(field, value));
                } catch (error) {
                    onError?.(error);
                }
            }
            onAttachedClose?.();
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
        if (!queued && (!widget.isVisible() || (parentDocument && widget.owner_ !== widgetOwner))) close();
    });
    const ownsOpenWidget = () => !scoped ||
        (widget.DIV === widgetHost && widget.owner_ === widgetOwner && widget.isVisible());
    function stageValue(next: unknown) {
        if (closed || (oneUse && queued) || !valid() || !ownsOpenWidget()) return;
        withoutEvents(() => setValue.call(field, next));
        if (queued || field.getValue() === value) return;
        queued = true;
        queueMicrotask(() => {
            if (closed) return;
            try {
                const result = field.getValue();
                const accepted = valid() && ownsOpenWidget() && typeof result === 'string' && result !== value;
                close();
                if (accepted && valid()) commit(result);
            } catch (error) {
                close();
                onError?.(error);
            }
        });
    }
    try {
        if (isolated) {
            withoutEvents(() => setValue.call(field, value));
            if (field.getValue() !== value) {
                close();
                return;
            }
        }
        widget.hide(true);
        widget.DIV = widgetHost;
        ownsWidget = true;
        if (parentDocument) {
            original.style.opacity = '0';
            original.inert = true;
        }
        field.setValue = stageValue;
        try {
            if (editController) {
                const edit: NativeFieldEditSession = {signal: editController.signal, commit(next) {
                    if (queued || typeof next !== 'string') return;
                    try {
                        stageValue(next);
                    } catch (error) {
                        close();
                        onError?.(error);
                    }
                }};
                field.showEditor_(edit);
            } else {
                field.showEditor_();
            }
        } finally {
            widgetOwner = widget.owner_;
        }
        if (!widget.isVisible() || !widgetHost.childElementCount) {
            close();
            return;
        }
        if (parentDocument) {
            disposeMirror = mirrorParentField(original, host, () => !closed && valid(), resources);
            if (!disposeMirror) {
                close();
                return;
            }
            host.style.display = 'block';
        }
        host.style.position = 'fixed';
        host.style.left = `${Math.max(0, Math.min(anchor.left, window.innerWidth - host.offsetWidth))}px`;
        host.style.top = `${Math.max(0, Math.min(anchor.bottom, window.innerHeight - host.offsetHeight))}px`;
        observer.observe(widgetHost, {attributes: true, attributeFilter: ['style']});
        document.addEventListener('keydown', escape, true);
        document.addEventListener('pointerdown', outside, true);
        if (scoped) {
            window.addEventListener('blur', close);
            window.addEventListener('pagehide', close);
        }
        return close;
    } catch (error) {
        close();
        onError?.(error);
    }
}
