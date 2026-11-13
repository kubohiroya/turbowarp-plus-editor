import {getCodeSession} from './workspace.ts';
import type {AttachPreviewMinimap} from './workspace.ts';
import {getDockedScriptLayout, type ScriptView} from './script-layout-view.ts';

type Pane = {id: string; targetId: string; section: number};
type Bridge = NonNullable<ReturnType<typeof getCodeSession>['bridge']>;
type Presentation = NonNullable<ReturnType<Bridge['capturePane']>>;

export function createCodePaneAdapter(vm, locale: string, attachMinimap?: AttachPreviewMinimap) {
    const session = getCodeSession(vm);
    const label = /^ja(?:-|$)/i.test(locale) ? 'このペインでコードを編集' : 'Edit code in this pane';
    const views = new Map<string, ScriptView>();
    let pending: {frame: number; pane: Pane; presentation: Presentation} | undefined;
    const costumeUpdates = new Set<() => void>();
    const updateCostumes = () => costumeUpdates.forEach(update => update());

    function watchCostume(image: HTMLImageElement, readTarget) {
        let shownAsset;
        image.removeAttribute('src');
        function update() {
            const target = readTarget();
            const asset = target?.getCostumes()[target.currentCostume]?.asset;
            if (shownAsset === asset) return;
            shownAsset = asset;
            if (asset) image.src = asset.encodeDataURI();
            else image.removeAttribute('src');
        }
        if (!costumeUpdates.size) vm.on('targetsUpdate', updateCostumes);
        costumeUpdates.add(update);
        update();
        return () => {
            costumeUpdates.delete(update);
            if (!costumeUpdates.size) vm.removeListener('targetsUpdate', updateCostumes);
        };
    }

    return {
        ownsClick: (element: EventTarget) => Boolean((element as Element)?.closest?.('[data-code-view-control]')),
        watchEditingCostume: (image: HTMLImageElement) => watchCostume(image, () => vm.editingTarget),
        capture(pane: Pane) {
            if (pane.section !== 0) return;
            if (pending?.pane.id === pane.id) {
                const {frame, presentation} = pending;
                cancelAnimationFrame(frame);
                pending = undefined;
                return presentation;
            }
            views.set(pane.id, getDockedScriptLayout(vm)?.view.view ?? 'free');
            return session.bridge?.capturePane(pane.targetId);
        },
        restore(pane: Pane, presentation?: Presentation) {
            if (pending) cancelAnimationFrame(pending.frame);
            pending = undefined;
            if (pane.section !== 0) return;
            getDockedScriptLayout(vm)?.view.setView(views.get(pane.id) ?? 'free');
            if (!presentation) return;
            const frame = requestAnimationFrame(() => {
                pending = undefined;
                session.bridge?.restorePane(pane.targetId, presentation);
            });
            pending = {frame, pane, presentation};
        },
        renderInactive(container: HTMLElement, pane: Pane, presentation?: Presentation) {
            if (pane.section !== 0) return;
            const target = vm.runtime.getTargetById(pane.targetId);
            if (!target) return;
            const document = container.ownerDocument;
            const surface = document.createElement('div');
            surface.dataset.codePreview = '';
            surface.dataset.codeHoverSurface = '';
            surface.tabIndex = 0;
            surface.setAttribute('role', 'button');
            surface.setAttribute('aria-label', label);
            surface.addEventListener('keydown', event => {
                if (event.target !== surface || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                event.stopPropagation();
                surface.click();
            });

            const blocks = document.createElement('div');
            const chrome = document.createElement('div');
            chrome.className = 'tw-code-preview-chrome';
            for (const child of [blocks, chrome]) child.setAttribute('inert', '');
            const watermark = document.createElement('div');
            watermark.dataset.dockviewCostumeThumbnail = '';
            const image = document.createElement('img');
            image.alt = '';
            watermark.appendChild(image);
            chrome.appendChild(watermark);
            surface.append(blocks, chrome);
            container.appendChild(surface);

            const stopCostume = watchCostume(image, () => target);
            let bridge: Bridge | null;
            let preview: ReturnType<Bridge['preview']> | undefined;
            function update() {
                if (bridge !== session.bridge) {
                    preview?.dispose();
                    bridge = session.bridge;
                    preview = bridge?.preview(blocks, chrome, {target, presentation, attachMinimap, watermark, locale,
                        scriptView: views.get(pane.id), onScriptViewChange: view => views.set(pane.id, view)});
                }
                preview?.update();
            }
            const unsubscribe = session.subscribe(update);
            update();
            return () => {
                stopCostume();
                unsubscribe();
                preview?.dispose();
                surface.remove();
            };
        }
    };
}
