const path = require('node:path');

module.exports = (source: string) => {
    const request = 'assetPromise = fetch(projectUrl)';
    const loaded = '.then(buffer => ({data: buffer}));';
    if (!source.includes(request) || !source.includes(loaded)) {
        throw new Error('Pinned GUI project URL fetch has changed');
    }
    const adapter = path.resolve(__dirname, '../../site/project-url.ts');
    return `import {fetchProjectUrl as fetch} from ${JSON.stringify(adapter)};
import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';
${source.replace(request, 'assetPromise = withWaitCursor([document], () => fetch(projectUrl)')
        .replace(loaded, '.then(buffer => ({data: buffer})));')}`;
};
