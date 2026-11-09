/**
 * Hand the debugger add-on's button and window to the host.
 *
 * The button goes to the menu bar's extension controls, and the window to the host, which opens it
 * as a workspace tab. Without a host, or when the host declines, the add-on places both as before.
 */
module.exports = (source: string) => {
    const append = 'addon.tab.appendToSharedSpace({ space: "stageHeader", element: debuggerButtonOuter, order: 0 });';
    const remove = 'debuggerButtonOuter.remove();';
    const mount = 'document.body.append(interfaceContainer);';
    if (!source.includes(append) || !source.includes(remove) || !source.includes(mount)) {
        throw new Error('The pinned GUI debugger placement has changed');
    }
    return `import {getHostIntegration} from '../../hooks.js';
${source.replace(append, `if (!getHostIntegration()?.setDebuggerMenuButton?.(vm, debuggerButtonOuter)) {
        ${append}
      }`).replace(remove, `getHostIntegration()?.setDebuggerMenuButton?.(vm, null);
      ${remove}`).replace(mount, `if (!getHostIntegration()?.setDebuggerInterface?.(vm, {
    element: interfaceContainer,
    setVisible: setInterfaceVisible,
    getLocale: () => addon.tab.redux.state?.locales?.locale
  })) {
    ${mount}
  }`)}`;
};
