import React from 'react';
import {PROJECT_TOOLS_ENABLED} from './config.js';
import {installProjectProperties} from './properties.js';
import {createAuthorHistory} from './history.js';
import {createProjectDialogs} from './dialog.js';
import {installEditorExtensionHost} from '../extension-host/editor-host.js';

const projects = new WeakMap();
const storageFor = document => {
    try { return document.defaultView?.localStorage; } catch (error) { return undefined; }
};

/** Compose this host's project tools with its existing extension host. */
export const installProjectToolsHost = (vm, settings = {}, enabled = PROJECT_TOOLS_ENABLED) => {
    const host = installEditorExtensionHost(vm, settings);
    if (!enabled) return host;
    const document = settings.document || globalThis.document;
    const properties = installProjectProperties(vm, settings);
    const history = createAuthorHistory(document ? storageFor(document) : undefined);
    const dialogs = document?.body ? createProjectDialogs(document, properties, history) : null;
    const tools = {properties, dialogs};
    projects.set(vm, tools);
    let disposal;
    return {...host, enabled: true, dispose () {
        disposal ??= (async () => {
            dialogs?.dispose(); properties.dispose(); projects.delete(vm);
            await host.dispose();
        })();
        return disposal;
    }};
};

export const loadedProjectTitle = vm => projects.get(vm)?.properties.loadedTitle();
export const restoreProjectTitle = vm => projects.get(vm)?.properties.restoreTitle();

/** The GUI supplies its native menu components; this host owns the added entries and dialogs. */
export const renderFileMenu = ({vm, locale = 'en', MenuSection, MenuItem, onRequestClose}) => {
    const tools = projects.get(vm);
    if (!tools?.dialogs) return null;
    const open = () => {
        onRequestClose();
        tools.dialogs.showProperties(locale);
    };
    return React.createElement(MenuSection, null, React.createElement(MenuItem, {onClick: open},
        React.createElement('span', {role: 'button', tabIndex: 0, onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open(); }
        }}, locale.startsWith('ja') ? '作品のプロパティ…' : 'Project Properties…')));
};

export const projectToolsOwnKeyEvent = event => Boolean(event.target?.closest?.('[data-project-tools]'));
