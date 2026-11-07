import {workspaceXML, type CodeTarget} from './history.ts';

interface Events {
    on(event: string, listener: () => void): void;
    removeListener(event: string, listener: () => void): void;
}

interface Workspace {
    options: {RTL: boolean; colours: object; pathToMedia: string};
    scale: number;
    isDragging(): boolean;
    setResizesEnabled(enabled: boolean): void;
    dispose(): void;
}

interface ScratchBlocks {
    mainWorkspace: Workspace;
    getMainWorkspace(): Workspace;
    inject(container: HTMLElement, options: object): Workspace;
    Events: {disable(): void; enable(): void};
    Field: {stopCache(): void};
    Xml: {
        textToDom(xml: string): Element;
        domToWorkspace(xml: Element, workspace: Workspace): void;
        domToBlock(xml: Element, workspace: Workspace): {dispose(healStack: boolean, animate: boolean): void};
    };
}

interface Context {
    vm: Events & {
        runtime: Events & {getTargetForStage(): CodeTarget | null};
        editingTarget: CodeTarget | null;
    };
    ScratchBlocks: ScratchBlocks;
    workspace: Workspace;
    document: Document;
    canUse(): boolean;
    onError(error: unknown): void;
}

const quietPeriod = 250;
const sliceBudget = 5;
const longSlice = 50;
const minimumBlocks = 100;
const maximumXmlLength = 1_000_000;
const inputEvents = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel', 'keydown', 'input'];

function* drawStage({vm, ScratchBlocks: blocks, workspace, document}: Context, stage: CodeTarget) {
    const xml = workspaceXML(vm, stage);
    if (xml.length > maximumXmlLength) return;
    const dom = blocks.Xml.textToDom(xml);
    const elements = dom.querySelectorAll('block, shadow');
    if (elements.length < minimumBlocks) return;
    yield;

    const container = document.createElement('div');
    container.dataset.twPlusStageCodePrewarm = '';
    container.setAttribute('aria-hidden', 'true');
    container.inert = true;
    container.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px;height:700px;visibility:hidden;pointer-events:none';
    document.body.append(container);

    let preview: Workspace | undefined;
    try {
        try {
            preview = blocks.inject(container, {
                readOnly: true, scrollbars: false, sounds: false, media: workspace.options.pathToMedia,
                rtl: workspace.options.RTL, colours: workspace.options.colours, zoom: {startScale: workspace.scale}
            });
        } finally {
            // Injection changes Blockly's main workspace. Restore it without moving browser focus.
            blocks.mainWorkspace = workspace;
        }
        // The live workspace already holds a reference to Blockly's field width cache.
        blocks.Field.stopCache();
        const variables = dom.querySelector('variables');
        if (variables) {
            const declarations = dom.cloneNode(false) as Element;
            declarations.append(variables.cloneNode(true));
            blocks.Xml.domToWorkspace(declarations, preview);
        }
        preview.setResizesEnabled(false);
        yield;

        const drawn = new Set<string>();
        for (const element of elements) {
            // Document pickers can enumerate and validate provider metadata during field setup.
            // Let the foreground editor initialize them when the user opens the stage.
            if (Array.from(element.children).some(child =>
                child.localName === 'field' && child.getAttribute('name') === 'DOCUMENT')) {
                yield;
                continue;
            }
            // A whole connected script can exceed the slice budget. Draw one block's fields and
            // mutation without its children so the renderer can reuse its normal field resources.
            const block = element.cloneNode(false) as Element;
            block.removeAttribute('id');
            block.removeAttribute('x');
            block.removeAttribute('y');
            for (const child of element.children) {
                if (child.localName === 'field' || child.localName === 'mutation') block.append(child.cloneNode(true));
            }
            const shape = block.outerHTML;
            if (!drawn.has(shape)) {
                blocks.Xml.domToBlock(block, preview).dispose(false, false);
                drawn.add(shape);
            }
            yield;
        }
    } finally {
        try {
            preview?.dispose();
        } finally {
            container.remove();
        }
    }
}

export function attachStageCodePrewarm(context: Context) {
    const {vm, ScratchBlocks: blocks, workspace, document, canUse, onError} = context;
    const host = document.defaultView;
    let job: {stage: CodeTarget; drawing: Generator<void, void>} | undefined;
    let cancelScheduled: (() => void) | undefined;
    let running = false;
    let lastInput = 0;
    const withoutEvents = (action: () => void) => {
        blocks.Events.disable();
        try {
            action();
        } finally {
            blocks.Events.enable();
        }
    };
    const unschedule = () => {
        cancelScheduled?.();
        cancelScheduled = undefined;
    };
    const close = (drawing: Generator<void, void>) => {
        try {
            withoutEvents(() => drawing.return(undefined));
        } catch (error) {
            onError(error);
        }
    };
    const cancel = () => {
        unschedule();
        const previous = job;
        job = undefined;
        if (previous && !running) close(previous.drawing);
    };
    const usable = () => !document.hidden && canUse() && !workspace.isDragging() &&
        blocks.getMainWorkspace() === workspace;
    const quietRemaining = () => quietPeriod - (host.performance.now() - lastInput);

    function schedule() {
        if (!job || cancelScheduled) return;
        const remainingQuiet = quietRemaining();
        if (remainingQuiet > 0 || !usable()) {
            const timer = host.setTimeout(() => {
                cancelScheduled = undefined;
                schedule();
            }, remainingQuiet > 0 ? Math.ceil(remainingQuiet) : quietPeriod);
            cancelScheduled = () => host.clearTimeout(timer);
            return;
        }
        const draw = (deadline?: IdleDeadline) => {
            cancelScheduled = undefined;
            const current = job;
            if (!current || vm.runtime.getTargetForStage() !== current.stage || vm.editingTarget === current.stage) {
                cancel();
                return;
            }
            if (quietRemaining() > 0 || !usable()) {
                schedule();
                return;
            }
            const started = host.performance.now();
            const stopAt = started + sliceBudget;
            running = true;
            try {
                withoutEvents(() => {
                    while (job === current && host.performance.now() < stopAt && (!deadline || deadline.timeRemaining() > 1)) {
                        if (!current.drawing.next().done) continue;
                        if (job === current) job = undefined;
                        break;
                    }
                });
                // A single synchronous block constructor can overrun the budget. Avoid repeating it.
                if (job === current && host.performance.now() - started >= longSlice) cancel();
            } catch (error) {
                if (job === current) cancel();
                onError(error);
            } finally {
                running = false;
                if (job !== current) close(current.drawing);
            }
            schedule();
        };
        if (host.requestIdleCallback) {
            const idle = host.requestIdleCallback(draw);
            cancelScheduled = () => host.cancelIdleCallback(idle);
        } else {
            const timer = host.setTimeout(draw, 16);
            cancelScheduled = () => host.clearTimeout(timer);
        }
    }

    const input = () => {
        if (!job) return;
        lastInput = host.performance.now();
        schedule();
    };
    const loaded = () => {
        cancel();
        const stage = vm.runtime.getTargetForStage();
        if (!stage || vm.editingTarget === stage) return;
        lastInput = host.performance.now();
        job = {stage, drawing: drawStage(context, stage)};
        schedule();
    };
    const targetsUpdated = () => {
        if (job && vm.editingTarget === job.stage) cancel();
    };

    vm.runtime.on('PROJECT_LOADED', loaded);
    vm.runtime.on('RUNTIME_DISPOSED', cancel);
    vm.on('PROJECT_CHANGED', cancel);
    vm.on('PROJECT_RUN_START', cancel);
    vm.on('targetsUpdate', targetsUpdated);
    for (const event of inputEvents) document.addEventListener(event, input, {capture: true, passive: true});
    loaded();

    return {dispose() {
        cancel();
        vm.runtime.removeListener('PROJECT_LOADED', loaded);
        vm.runtime.removeListener('RUNTIME_DISPOSED', cancel);
        vm.removeListener('PROJECT_CHANGED', cancel);
        vm.removeListener('PROJECT_RUN_START', cancel);
        vm.removeListener('targetsUpdate', targetsUpdated);
        for (const event of inputEvents) document.removeEventListener(event, input, true);
    }};
}
