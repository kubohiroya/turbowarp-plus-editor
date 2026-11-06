import React from 'react';
import {MANUAL_PROJECT_URI_ENABLED, PROJECT_TOOLS_ENABLED} from './config.ts';
import {installProjectProperties} from './properties.ts';
import {createAuthorHistory} from './history.ts';
import {createProjectDialogs} from './dialog.ts';
import {installEditorExtensionHost} from '../extension-host/editor-host.ts';
import {editProjectURI} from '../extension-host/project-loader.ts';
import {createProjectDiagnostics} from './diagnostics.ts';

const projects = new WeakMap();
const storageFor = document => {
    try { return document.defaultView?.localStorage; } catch (error) { return undefined; }
};

/** Compose this host's project tools with its existing extension host. */
export const installProjectToolsHost = (vm, settings: Parameters<typeof installEditorExtensionHost>[1] & Parameters<typeof installProjectProperties>[1] = {}, enabled = PROJECT_TOOLS_ENABLED) => {
    const diagnostics = createProjectDiagnostics();
    const host = installEditorExtensionHost(vm, {...settings, showDiagnostics: false,
        diagnostics: event => { diagnostics.record(event); settings.diagnostics?.(event); },
        onProjectManifest: manifest => { diagnostics.describe(manifest); settings.onProjectManifest?.(manifest); }});
    const document = settings.document || globalThis.document;
    const properties = installProjectProperties(vm, {...settings, metadataEnabled: enabled});
    const history = enabled ? createAuthorHistory(document ? storageFor(document) : undefined) : null;
    const dialogs = document?.body ? createProjectDialogs(document, properties, history, diagnostics,
        {locale: settings.locale}) : null;
    const tools = {dialogs, payloads: 'payloads' in host ? host.payloads : undefined, propertiesEnabled: enabled,
        projectURIEnabled: MANUAL_PROJECT_URI_ENABLED && host.enabled, properties};
    let lastPhase;
    const unsubscribe = properties.subscribe(() => {
        const state = properties.loadState();
        const key = `${state.sequence}:${state.phase}`;
        if (lastPhase === key) return;
        lastPhase = key;
        if (state.phase === 'loading') diagnostics.begin();
        else if (state.phase === 'loaded' || state.phase === 'failed') {
            diagnostics.finish(state, state.phase === 'failed' ? state.title || '' : properties.loadedTitle() || '');
        }
    });
    projects.set(vm, tools);
    let disposal;
    return {...host, dispose () {
        disposal ??= (async () => {
            unsubscribe(); dialogs?.dispose(); properties.dispose(); diagnostics.dispose(); projects.delete(vm);
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
    const open = type => {
        onRequestClose();
        if (type === 'properties') {
            tools.dialogs.showProperties(locale, tools.projectURIEnabled ? editProjectURI(vm) : undefined);
        } else if (type === 'payloads') {
            tools.dialogs.showPayloadFormats(tools.payloads.edit(), locale);
        } else if (type === 'bundle-assets') {
            const conversion = tools.payloads.convert();
            if (conversion) tools.dialogs.showBundleAssetConversion(conversion, locale);
        } else tools.dialogs.showDiagnostics(locale);
    };
    const entries = [
        ['properties', '作品のプロパティ…', 'Project Properties…', tools.propertiesEnabled || tools.projectURIEnabled],
        ['payloads', '作品データの形式…', 'Project Data Formats…', tools.payloads?.canEdit],
        ['bundle-assets', 'バンドル素材を作品に追加…', 'Add Bundle Material to Project…', tools.payloads?.canConvert],
        ['diagnostics', '作品の診断…', 'Project Diagnostics…', true]
    ].filter(([, , , enabled]) => enabled);
    return React.createElement(MenuSection, null, ...entries.map(([type, ja, en]) =>
        React.createElement(MenuItem, {key: type, command: type, onClick: () => open(type)},
        React.createElement('span', {role: 'button', tabIndex: 0, onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); event.stopPropagation(); open(type);
            }
        }}, locale.startsWith('ja') ? ja : en))));
};

export const projectToolsOwnKeyEvent = event => Boolean(event.target?.closest?.('[data-project-tools]'));
