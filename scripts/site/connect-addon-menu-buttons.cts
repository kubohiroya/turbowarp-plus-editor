/**
 * Hand editor add-on buttons to the host's menu bar extension controls.
 *
 * Debugger: the button goes to the extension controls, and the window to the host, which opens it
 * as a workspace tab. Stage recorder: the add-on appends a text-only "Record" item after the File
 * menu, where it is easy to miss; the host shows it among the extension controls as an icon.
 * Without a host, or when the host declines, each add-on places its button as before.
 */
const connectDebugger = (source: string) => {
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

const connectRecorder = (source: string) => {
    const append = '    elem.parentElement.appendChild(recordElem);';
    if (source.indexOf(append) === -1 || source.indexOf(append) !== source.lastIndexOf(append)) {
        throw new Error('The pinned GUI stage recorder placement has changed');
    }
    return `import {getHostIntegration} from '../../hooks.js';
${source.replace(append, `    // Each pass may follow a language change, so an idle button takes the current text.
    if (!isRecording && !isWaitingForFlag) recordElem.textContent = msg("record");
    if (!getHostIntegration()?.setRecordMenuButton?.(addon.tab.traps.vm, recordElem, msg("record"))) {
  ${append}
    }`)}`;
};

module.exports = function (this: {resourcePath: string}, source: string) {
    const addon = this.resourcePath.split(/[\\/]/).at(-2);
    if (addon === 'debugger') return connectDebugger(source);
    if (addon === 'mediarecorder') return connectRecorder(source);
    throw new Error(`No menu button connection for the ${addon} add-on`);
};
