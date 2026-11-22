module.exports = (source: string) => {
    const request = 'assetPromise = fetch(projectUrl)';
    const loaded = '.then(buffer => ({data: buffer}));';
    if (!source.includes(request) || !source.includes(loaded)) {
        throw new Error('Pinned GUI project URL fetch has changed');
    }
    // The Scratch page and Kamishibai mirror handling is the Workbench's.
    return `import {fetchProjectUrl as fetch} from '@kubohiroya/turbowarp-plus-editor-workbench/project-url';
import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-workbench/busy-cursor';
${source.replace(request, 'assetPromise = withWaitCursor([document], () => fetch(projectUrl)')
        .replace(loaded, '.then(buffer => ({data: buffer})));')}`;
};
