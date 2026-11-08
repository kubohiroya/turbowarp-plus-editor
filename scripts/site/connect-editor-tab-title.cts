module.exports = (source: string) => {
    const mount = 'render(<Interface />);';
    if (!source.includes(mount)) throw new Error('The pinned web editor entry has changed');
    return source.replace(mount, `import {updateBrowserTabTitle} from '@kubohiroya/turbowarp-plus-editor-ui/browser-tab-title';

render(<Interface onUpdateProjectTitle={updateBrowserTabTitle} />);`);
};
