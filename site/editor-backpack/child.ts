const ticket = location.hash.slice(1);
function connect(event: MessageEvent) {
    if (event.source !== window.opener || event.origin !== location.origin ||
        event.data?.type !== 'stage2/connect' || event.data.ticket !== ticket || event.ports.length !== 1) return;
    window.removeEventListener('message', connect);
    const [port] = event.ports;
    port.postMessage('stage2/connected');
    window.addEventListener('pagehide', () => port.postMessage('stage2/disconnect'), {once: true});
}
window.addEventListener('message', connect);
window.opener?.postMessage({type: 'stage2/ready', ticket}, location.origin);
