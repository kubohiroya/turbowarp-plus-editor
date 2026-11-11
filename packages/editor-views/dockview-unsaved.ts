type Reference = {providerId: string; documentId: string};
type Asset = {assetId: string; name: string; dataFormat: string; rotationCenterX?: number; rotationCenterY?: number;
    bitmapResolution?: number; format?: string; rate?: number; sampleCount?: number};
type Target = {id: string; isOriginal: boolean; extensionStorage?: unknown;
    toJSON(): {costume: unknown; costumes: Asset[]; sounds: Asset[]}};
type TabSubject = {target?: Target; document?: Reference};
type Project = {
    runtime: {
        targets: Target[];
        on(event: 'PROJECT_LOADED', listener: () => void): void;
        removeListener(event: 'PROJECT_LOADED', listener: () => void): void;
    };
    on(event: string, listener: () => void): void;
    removeListener(event: string, listener: () => void): void;
};
type Store = {getState(): {scratchGui: {projectChanged: boolean}}; subscribe(listener: () => void): () => void};

export const documentEditEvent = 'tw-plus-document-edit-state';

const documentKey = ({providerId, documentId}: Reference) => JSON.stringify([providerId, documentId]);

function targetSnapshot(target: Target) {
    // Use the VM's target model without invoking project serialization or copying asset bytes.
    const {costume: _current, costumes, sounds, ...properties} = target.toJSON();
    const assets = costumes.map(({assetId, name, dataFormat, rotationCenterX, rotationCenterY, bitmapResolution}) =>
        [assetId, name, dataFormat, rotationCenterX, rotationCenterY, bitmapResolution]);
    const audio = sounds.map(({assetId, name, dataFormat, format, rate, sampleCount}) =>
        [assetId, name, dataFormat, format, rate, sampleCount]);
    return JSON.stringify([properties, assets, audio, target.extensionStorage]);
}

export function mountDockviewUnsaved(vm: Project, root: HTMLElement, locale: string) {
    const document = root.ownerDocument;
    const window = document.defaultView as Window & {ReduxStore?: Store};
    const store = window.ReduxStore;
    if (!store) return;
    const label = locale.startsWith('ja') ? '未保存の変更' : 'Unsaved changes';
    const tabs = new Set<() => void>();
    const applied = new Set<string>();
    const drafts = new Set<string>();

    function snapshot() {
        return new Map(vm.runtime.targets.filter(target => target.isOriginal).map(target => [target.id, targetSnapshot(target)]));
    }

    let baseline = snapshot();
    let current = baseline;
    let frame: number | undefined;
    let dirty = store.getState().scratchGui.projectChanged;
    const refreshTabs = () => tabs.forEach(refresh => refresh());
    const update = () => {
        frame = undefined;
        current = snapshot();
        refreshTabs();
    };
    const schedule = () => {
        frame ??= window.requestAnimationFrame(update);
    };
    const resetBaseline = () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        frame = undefined;
        baseline = current = snapshot();
        applied.clear();
        refreshTabs();
    };
    const loaded = () => {
        drafts.clear();
        resetBaseline();
    };
    const unsubscribe = store.subscribe(() => {
        const next = store.getState().scratchGui.projectChanged;
        if (dirty === next) return;
        dirty = next;
        if (dirty) schedule();
        else resetBaseline();
    });
    vm.on('PROJECT_CHANGED', schedule);
    vm.runtime.on('PROJECT_LOADED', loaded);
    // Some hosts create the workbench before installing their default project.
    const initialTargets = () => {
        if (!dirty && !baseline.size && vm.runtime.targets.length) resetBaseline();
    };
    vm.on('targetsUpdate', initialTargets);

    return {
        tab(element: HTMLElement, subject: () => TabSubject) {
            const title = element.querySelector('.dv-default-tab-content');
            const marker = document.createElement('span');
            marker.dataset.twPlusUnsavedMarker = '';
            marker.dataset.twPlusUnsavedTab = '';
            marker.setAttribute('aria-hidden', 'true');
            marker.title = label;
            marker.hidden = true;
            title?.after(marker);
            const refresh = () => {
                const {target, document: reference} = subject();
                const key = reference && documentKey(reference);
                const changed = target && dirty && baseline.get(target.id) !== current.get(target.id) ||
                    key && (drafts.has(key) || applied.has(key));
                marker.hidden = !changed;
                const tab = element.closest('[role="tab"]');
                if (changed) tab?.setAttribute('aria-description', label);
                else tab?.removeAttribute('aria-description');
            };
            tabs.add(refresh);
            refresh();
            // Dockview sets up the renderer before inserting it into its tab element.
            queueMicrotask(() => { if (tabs.has(refresh)) refresh(); });
            return () => { tabs.delete(refresh); };
        },
        document(element: HTMLElement, reference: Reference) {
            const key = documentKey(reference);
            const changed = (event: CustomEvent<{draft: boolean; applied: boolean}>) => {
                if (event.detail.draft) drafts.add(key);
                else drafts.delete(key);
                if (event.detail.applied) applied.add(key);
                refreshTabs();
            };
            element.addEventListener(documentEditEvent, changed as EventListener);
            return () => {
                element.removeEventListener(documentEditEvent, changed as EventListener);
                if (drafts.delete(key)) refreshTabs();
            };
        },
        dispose() {
            if (frame !== undefined) window.cancelAnimationFrame(frame);
            unsubscribe();
            vm.removeListener('PROJECT_CHANGED', schedule);
            vm.runtime.removeListener('PROJECT_LOADED', loaded);
            vm.removeListener('targetsUpdate', initialTargets);
            tabs.clear();
        }
    };
}
