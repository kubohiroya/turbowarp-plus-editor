import React from 'react';
import {withWaitCursor, withoutWaitCursor} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';
import {captureProjectLoad, duringProjectLoadApproval, reportProjectAssets, reportProjectFinishing}
    from '@kubohiroya/turbowarp-plus-editor-ui/project-load-progress';
import {MANUAL_PROJECT_URI_ENABLED, PROJECT_TOOLS_ENABLED} from './config.ts';
import {installProjectProperties} from './properties.ts';
import {createAuthorHistory} from './history.ts';
import {createProjectDialogs} from './dialog.ts';
import {installEditorExtensionHost} from '../extension-host/editor-host.ts';
import {editProjectURI} from '../extension-host/project-loader.ts';
import {createProjectDiagnostics} from './diagnostics.ts';
import {getExtensionAuthoringHost} from '../extension-host/authoring.ts';
import {withProjectSerialization} from '../extension-host/serialization-context.ts';
import {renderExportView, renderExtensionsForm, renderSaveAsForm, saveProjectAs} from '@kubohiroya/turbowarp-plus-editor-ui/project-file-dialogs';
import type {ProjectFileStorage, ExtensionStorage} from '@kubohiroya/turbowarp-plus-editor-ui/project-file-dialogs';
import type {ExtensionSpec} from '@kubohiroya/turbowarp-extension-loader';
import {editorProjectArchives} from '../extension-host/shared-project-archive.ts';

const projects = new WeakMap();
const storageFor = document => {
    try { return document.defaultView?.localStorage; } catch (error) { return undefined; }
};

/** Compose this host's project tools with its existing extension host. */
export const installProjectToolsHost = (vm, settings: Parameters<typeof installEditorExtensionHost>[1] & Parameters<typeof installProjectProperties>[1] = {}, enabled = PROJECT_TOOLS_ENABLED) => {
    const diagnostics = createProjectDiagnostics();
    const document = settings.document || globalThis.document;
    const runProjectLoad = document ? <T>(run: () => Promise<T>) => withWaitCursor([document], run) : undefined;
    const host = installEditorExtensionHost(vm, {...settings, showDiagnostics: false, runProjectLoad,
        projectArchives: editorProjectArchives,
        captureProjectProgress: () => captureProjectLoad(vm),
        waitForUser: document ? ask => duringProjectLoadApproval(vm, () => withoutWaitCursor(document, ask)) : undefined,
        diagnostics: event => { diagnostics.record(event); settings.diagnostics?.(event); },
        onProjectManifest: manifest => { diagnostics.describe(manifest); settings.onProjectManifest?.(manifest); }});
    const shareArchives = 'projectIO' in host && 'supportsSharedArchive' in host.projectIO && host.projectIO.supportsSharedArchive === true;
    const properties = installProjectProperties(vm, {...settings, metadataEnabled: enabled, runProjectLoad, shareArchives});
    const reportAssets = (finished: number, total: number) => reportProjectAssets(vm, finished, total);
    const finishProject = () => reportProjectFinishing(vm);
    vm.on?.('ASSET_PROGRESS', reportAssets);
    vm.runtime?.on?.('PROJECT_LOADED', finishProject);
    const history = enabled ? createAuthorHistory(document ? storageFor(document) : undefined) : null;
    const dialogs = document?.body ? createProjectDialogs(document, properties, history, diagnostics,
        {locale: settings.locale, getLocale: settings.getLocale}) : null;
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
            vm.off?.('ASSET_PROGRESS', reportAssets);
            vm.runtime?.off?.('PROJECT_LOADED', finishProject);
            unsubscribe(); dialogs?.dispose(); properties.dispose(); diagnostics.dispose(); projects.delete(vm);
            await host.dispose();
        })();
        return disposal;
    }};
};

export const loadedProjectTitle = vm => projects.get(vm)?.properties.loadedTitle();
export const restoreProjectTitle = vm => projects.get(vm)?.properties.restoreTitle();
export const isProjectLoading = vm => Boolean(projects.get(vm)?.properties.snapshot().loading);
export const subscribeProjectLoad = (vm, listener: () => void) => projects.get(vm)?.properties.subscribe(listener);

export function projectFileActions(vm, locale: string, storage: ProjectFileStorage, detachFolder: () => void, add?: () => void) {
    const tools = projects.get(vm);
    if (!tools?.dialogs) return {};
    const {dialogs, properties, payloads} = tools;
    const ja = locale.startsWith('ja');
    const label = (jp: string, en: string) => ja ? jp : en;
    const showSaveAs = () => dialogs.showView(label('名前を変えて保存', 'Save As'), locale, (document, close) =>
        renderSaveAsForm(document, locale, storage, async (name, format, open) => {
            if (tools.saving) return false;
            tools.saving = true;
            const sequence = properties.loadState().sequence;
            const current = () => open() && projects.get(vm) === tools && properties.loadState().sequence === sequence;
            let edited = false;
            const changed = () => {edited = true;};
            vm.on?.('PROJECT_CHANGED', changed);
            try {
                let embed: (() => void) | undefined;
                let commitMetadata: (() => void) | undefined;
                return await saveProjectAs(storage, name, {
                    current,
                    unchanged: () => !edited,
                    serialize(title, run) {
                        embed = format === 'embedded' ? payloads?.embedOnSave() : undefined;
                        return withProjectSerialization(vm, {title, deferCommit: commit => {commitMetadata = commit;}},
                            () => embed ? payloads.withEmbedded(run) : run());
                    },
                    committed() {
                        embed?.();
                        commitMetadata?.();
                        detachFolder();
                    }
                });
            } finally {
                vm.off?.('PROJECT_CHANGED', changed);
                tools.saving = false;
            }
        }, close));
    const openPayloads = () => dialogs.showPayloadFormats(payloads.edit(), locale, payloads.canConvert ? () => {
        const conversion = payloads.convert();
        if (conversion) dialogs.showBundleAssetConversion(conversion, locale);
    } : undefined);
    const authoring = getExtensionAuthoringHost(vm);
    const openExtensions = () => dialogs.showView(label('機能拡張', 'Extensions'), locale, (document, close) => {
        let saved = new Map<string, ExtensionSpec>();
        return renderExtensionsForm(document, locale, close, add, {
            async list() {
                const manifest = await authoring?.inspect();
                saved = new Map((manifest?.extensions || []).map(spec => [spec.id, spec]));
                const ids = new Set<string>([...saved.keys(), ...(vm.extensionManager?._loadedExtensions?.keys() || [])]);
                return [...ids].sort().map(id => {
                    const spec = saved.get(id);
                    return {id, format: spec?.source.type, editable: Boolean(spec?.source.url)};
                });
            },
            async change(changes: Map<string, ExtensionStorage>) {
                await authoring.configure([...changes].map(([id, distribution]) => {
                    const spec = saved.get(id);
                    return {id, distribution, url: spec.source.url, execution: spec.execution,
                        version: spec.version, dependencies: [...spec.dependencies]};
                }), {});
            }
        });
    });
    const hasProperties = tools.propertiesEnabled || tools.projectURIEnabled;
    return {
        saveAs: showSaveAs,
        properties: hasProperties ?
            () => dialogs.showProperties(locale, tools.projectURIEnabled ? editProjectURI(vm) : undefined) : undefined,
        diagnostics: hasProperties ? undefined : () => dialogs.showDiagnostics(locale),
        payloads: payloads?.canEdit ? openPayloads : undefined,
        extensions: add || authoring ? openExtensions : undefined,
        exportProject: (run: () => void) => dialogs.showView(label('書き出し', 'Export'), locale,
            (document, close) => renderExportView(document, locale, close, run))
    };
}

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
