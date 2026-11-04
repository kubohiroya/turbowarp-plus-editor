import type {SurfaceConnection, SurfaceHost} from '@kubohiroya/turbowarp-editor-surfaces';

export interface MountedSurface {
    mount: HTMLElement;
    port: MessagePort;
}
export interface OpenRequest {
    timeoutMs?: number;
    skipHandshake?: boolean;
}

export function createBrowserHost(
    parent: Window,
    show: (url: URL, ticket: string) => Window | null,
    page = 'code-popout.html',
    detachOpener = false
): SurfaceHost<OpenRequest, MountedSurface> {
    return {
        open({timeoutMs = 5000, skipHandshake = false} = {}): SurfaceConnection<MountedSurface> | null {
            const ticket = crypto.randomUUID();
            const url = new URL(page, parent.location.href);
            url.hash = ticket;
            const child = show(url, ticket);
            if (!child) return null;

            const disconnected = new AbortController();
            const channel = new MessageChannel();
            let connectedDocument: Document | undefined;
            let mounted = false;
            let closed = false;
            let resolve!: (target: MountedSurface) => void;
            let reject!: (error: Error) => void;
            const ready = new Promise<MountedSurface>((ok, fail) => {
                resolve = ok;
                reject = fail;
            });

            function close() {
                if (closed) return;
                closed = true;
                parent.removeEventListener('message', handshake);
                parent.removeEventListener('pagehide', disconnect);
                parent.clearInterval(watcher);
                parent.clearTimeout(deadline);
                channel.port1.removeEventListener('message', handlePort);
                channel.port1.close();
                channel.port2.close();
                reject(new Error('Surface closed'));
                child?.close();
            }

            function disconnect() {
                disconnected.abort();
                close();
            }

            function handshake(event: MessageEvent) {
                if (skipHandshake || !child || event.source !== child || event.origin !== parent.location.origin ||
                    event.data?.type !== 'stage2/ready' || event.data.ticket !== ticket || connectedDocument) return;
                try {
                    if (child.document.URL !== url.href) return;
                    connectedDocument = child.document;
                    child.postMessage({type: 'stage2/connect', ticket}, parent.location.origin, [channel.port2]);
                } catch {
                    reject(new Error('Surface connection unavailable'));
                }
            }

            function handlePort(event: MessageEvent) {
                if (event.data === 'stage2/disconnect') {
                    disconnect();
                    return;
                }
                if (mounted || !connectedDocument || event.data !== 'stage2/connected') return;
                const mount = connectedDocument.getElementById('mount');
                if (!mount) {
                    reject(new Error('Surface mount missing'));
                    return;
                }
                if (detachOpener && child) {
                    try {
                        child.opener = null;
                        if (child.opener !== null) throw new Error('Opener still accessible');
                    } catch {
                        reject(new Error('Surface opener could not be detached'));
                        return;
                    }
                }
                mounted = true;
                parent.clearTimeout(deadline);
                resolve({mount, port: channel.port1});
            }
            channel.port1.addEventListener('message', handlePort);
            channel.port1.start();
            const watcher = parent.setInterval(() => {
                try {
                    if (child.closed || (connectedDocument && child.document !== connectedDocument)) disconnect();
                } catch {
                    disconnect();
                }
            }, 100);
            const deadline = parent.setTimeout(() => reject(new Error('Surface readiness timed out')), timeoutMs);
            parent.addEventListener('message', handshake);
            parent.addEventListener('pagehide', disconnect, {once: true});
            return {ready, disconnected: disconnected.signal, close};
        }
    };
}
