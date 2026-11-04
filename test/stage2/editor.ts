import {createSurface} from '../../packages/editor-surfaces/index.ts';
import {createTransferSession, transferMime} from '../../packages/editor-transfer/index.ts';
import {createBrowserHost} from './browser-host.ts';

const sessionId = crypto.randomUUID();
const transfer = createTransferSession<string>(sessionId);
const dock = document.querySelector<HTMLElement>('#dock')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const state = document.querySelector<HTMLElement>('#surface-state')!;
const copies = document.querySelector<HTMLOutputElement>('#copies')!;
const mode = document.querySelector<HTMLSelectElement>('#open-mode')!;
const count = {editor: 0, panel: 0};

const surface = createSurface(createBrowserHost(window, (url, ticket) =>
    mode.value === 'blocked' ? null : window.open(url, `tw155-${ticket}`, 'popup,width=420,height=320')
), next => {
    state.textContent = next.kind === 'docked' && next.reason ? `docked:${next.reason}` : next.kind;
    if (next.kind === 'external') next.target.mount.append(panel);
    if (next.kind === 'docked') dock.append(panel);
});

document.querySelector('#undock')!.addEventListener('click', () => surface.undock({
    skipHandshake: mode.value === 'failed',
    timeoutMs: mode.value === 'failed' ? 700 : 5000
}));
panel.querySelector('#dock-button')!.addEventListener('click', () => surface.dock());
window.addEventListener('pagehide', () => {
    surface.dock();
    transfer.close();
}, {once: true});

for (const lane of ['editor', 'panel'] as const) {
    const source = document.querySelector<HTMLElement>(`#${lane}-source`)!;
    const destination = document.querySelector<HTMLElement>(`#${lane}-drop`)!;
    source.addEventListener('dragstart', event => {
        const data = event.dataTransfer;
        if (!data) return;
        const label = source.textContent!;
        const ref = transfer.offer('fixture-text', async signal => {
            await new Promise(resolve => setTimeout(resolve, 80));
            signal.throwIfAborted();
            return label;
        });
        data.effectAllowed = 'copy';
        data.setData(transferMime, JSON.stringify(ref));
    });
    // The source's dragend can race a drop in another document. Unclaimed references expire.
    destination.addEventListener('dragover', event => {
        if (!event.dataTransfer?.types.includes(transferMime)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    destination.addEventListener('drop', event => {
        const raw = event.dataTransfer?.getData(transferMime);
        if (!raw) return;
        event.preventDefault();
        // Record actual browser input and both distinct documents for the native smoke test.
        copies.dataset.trusted = String(event.isTrusted);
        copies.dataset.document = destination.ownerDocument.location?.pathname;
        transfer.receive(raw, {session: sessionId, id: lane}, (target, payload) => {
            if (!destination.isConnected || target.id !== lane) return false;
            count[lane]++;
            copies.value = JSON.stringify({...count, last: payload});
            return true;
        }).then(result => {copies.dataset.result = result;});
    });
}
