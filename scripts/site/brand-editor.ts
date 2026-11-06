import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// GitHub Release downloads do not allow a cross-origin fetch. Resolve this published SB3 to its
// byte-identical Pages copy before Scratch GUI reads project_url.
const projectUrlBootstrap = `<script>
(() => {
    const url = new URL(location.href);
    if (url.searchParams.get('project_url') !== 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v4.0.0-rc.79/kamishibai-4.0.0-rc.79.sb3') return;
    url.searchParams.set('project_url', 'https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads/kamishibai-4.0.0-rc.79.sb3');
    history.replaceState(history.state, '', url.href);
})();
</script>`;

export async function brandEditor(output, prefix = '/turbowarp-plus-editor/') {
    for (const name of ['editor.html', 'fullscreen.html', 'player.html']) {
        const file = path.join(output, name);
        let html = await fs.readFile(file, 'utf8');
        if (name === 'editor.html') {
            html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>TurboWarp-Plus-Editor</title>');
            html = html.replace(/<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, '');
            html = html.replace('</head>', `<link rel="icon" href="${prefix}assets/icon.svg" type="image/svg+xml"></head>`);
        }
        await fs.writeFile(file, html.replace('</head>', `${projectUrlBootstrap}</head>`));
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await brandEditor(process.argv[2]);
