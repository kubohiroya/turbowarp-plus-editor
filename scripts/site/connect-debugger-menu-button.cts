module.exports = (source: string) => {
    const append = 'addon.tab.appendToSharedSpace({ space: "stageHeader", element: debuggerButtonOuter, order: 0 });';
    const remove = 'debuggerButtonOuter.remove();';
    if (!source.includes(append) || !source.includes(remove)) {
        throw new Error('The pinned GUI debugger placement has changed');
    }
    return `import {getHostIntegration} from '../../hooks.js';
${source.replace(append, `if (!getHostIntegration()?.setDebuggerMenuButton?.(vm, debuggerButtonOuter)) {
        ${append}
      }`).replace(remove, `getHostIntegration()?.setDebuggerMenuButton?.(vm, null);
      ${remove}`)}`;
};
