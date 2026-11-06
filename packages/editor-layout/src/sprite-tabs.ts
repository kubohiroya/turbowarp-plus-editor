import React from 'react';
import {createPortal} from 'react-dom';
import {createDockview, themeLight} from 'dockview';
import type {IDockviewPanel} from 'dockview';

interface Target {
    id: string;
    isOriginal: boolean;
    isStage: boolean;
    getName(): string;
}

interface Project {
    editingTarget?: Target;
    runtime: {targets: Target[]};
    setEditingTarget(id: string): void;
    on(event: 'targetsUpdate', listener: () => void): void;
    removeListener(event: 'targetsUpdate', listener: () => void): void;
}

interface TabOptions {
    vm: Project;
    getSection(): number;
    activateSection(section: number): void;
    selectTarget(id: string): void;
    resize(): void;
    reopenLabel: string;
}

export function mountSpriteTabs(root: HTMLElement, content: HTMLElement, options: TabOptions) {
    const {vm} = options;
    const document = root.ownerDocument;
    const slots = new Map<string, HTMLElement>();
    const targets = new Map<string, Target>();
    const sections = new WeakMap<Target, number>();
    const closed = new WeakSet<Target>();
    let active: Target | undefined;
    let observed = vm.editingTarget;
    let syncing = false;

    const dockview = createDockview(root, {
        theme: themeLight,
        disableFloatingGroups: true,
        createComponent: () => {
            const element = document.createElement('div');
            element.className = 'tw-plus-sprite-tab-slot';
            return {element, init: ({api}) => { slots.set(api.id, element); }};
        },
        createWatermarkComponent: () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = options.reopenLabel;
            button.addEventListener('click', () => {
                if (vm.editingTarget) select(vm.editingTarget.id);
            });
            return {element: button, init() {}};
        }
    });
    // The host has one editable surface. Keep reordering inside its tab group.
    const overlay = dockview.onWillShowOverlay(event => {
        if (event.position !== 'center') event.preventDefault();
    });
    const drop = dockview.onWillDrop(event => {
        if (event.position !== 'center') event.preventDefault();
    });

    function show(panel: IDockviewPanel | undefined) {
        const next = targets.get(panel?.id);
        if (active === next) return;
        if (active) sections.set(active, options.getSection());
        const section = sections.get(next) ?? options.getSection();
        active = next;
        if (!next) {
            content.remove();
            options.selectTarget('');
            return;
        }

        slots.get(next.id).appendChild(content);
        if (vm.editingTarget !== next) vm.setEditingTarget(next.id);
        observed = vm.editingTarget;
        options.activateSection(section);
        options.selectTarget(next.id);
        options.resize();
    }

    function add(target: Target) {
        targets.set(target.id, target);
        return dockview.addPanel({id: target.id, title: target.getName(), component: 'sprite', inactive: true});
    }

    function select(id: string) {
        const target = vm.runtime.targets.find(item => item.id === id && item.isOriginal);
        if (!target) return;
        closed.delete(target);
        (dockview.getPanel(id) ?? add(target)).api.setActive();
    }

    function refresh() {
        if (syncing) return;
        syncing = true;
        try {
            const available = new Set(vm.runtime.targets.filter(target => target.isOriginal));
            const editing = vm.editingTarget;
            for (const [id, target] of targets) {
                if (!available.has(target)) dockview.getPanel(id)?.api.close();
            }
            for (const target of available) {
                if (target.isStage && target !== editing && !targets.has(target.id)) continue;
                const panel = dockview.getPanel(target.id);
                if (panel) {
                    if (panel.title !== target.getName()) panel.api.setTitle(target.getName());
                } else if (!closed.has(target)) add(target);
            }
            if (editing && (observed !== editing || !active && !closed.has(editing))) {
                observed = editing;
                select(editing.id);
            }
            show(dockview.activePanel);
        } finally {
            syncing = false;
        }
    }

    const selection = dockview.onDidActivePanelChange(({panel}) => {
        if (syncing) return;
        syncing = true;
        try {
            show(panel);
        } finally {
            syncing = false;
        }
    });
    const removal = dockview.onDidRemovePanel(panel => {
        const target = targets.get(panel.id);
        if (target) closed.add(target);
        targets.delete(panel.id);
        slots.delete(panel.id);
    });
    vm.on('targetsUpdate', refresh);
    refresh();
    return {
        select,
        dispose() {
            vm.removeListener('targetsUpdate', refresh);
            selection.dispose();
            removal.dispose();
            overlay.dispose();
            drop.dispose();
            content.remove();
            dockview.dispose();
        }
    };
}

type SpriteTabsProps = Omit<TabOptions, 'getSection'> & {
    children: React.ReactNode;
    enabled: boolean;
    activeSection: number;
    className: string;
    connect(controller: ReturnType<typeof mountSpriteTabs> | null): void;
};

function SpriteTabs(props: SpriteTabsProps) {
    const root = React.useRef<HTMLDivElement>(null);
    const latest = React.useRef(props);
    latest.current = props;
    const [content] = React.useState(() => document.createElement('div'));
    React.useLayoutEffect(() => {
        if (!props.enabled) {
            root.current.appendChild(content);
            latest.current.resize();
            return () => content.remove();
        }
        const controller = mountSpriteTabs(root.current, content, {
            vm: props.vm,
            getSection: () => latest.current.activeSection,
            activateSection: section => latest.current.activateSection(section),
            selectTarget: id => latest.current.selectTarget(id),
            resize: () => latest.current.resize(),
            reopenLabel: props.reopenLabel
        });
        latest.current.connect(controller);
        return () => {
            latest.current.connect(null);
            controller.dispose();
        };
    }, [content, props.enabled, props.vm, props.reopenLabel]);
    content.className = 'tw-plus-sprite-tab-editor';
    return React.createElement('div', {className: props.className}, React.createElement('div', {ref: root}),
        createPortal(props.children, content));
}

export function useSpriteTabs({available, enabled, locale, ...props}:
    Omit<SpriteTabsProps, 'children' | 'connect' | 'selectTarget' | 'reopenLabel'> & {available: boolean; locale: string}) {
    const controller = React.useRef<ReturnType<typeof mountSpriteTabs>>(null);
    const [selectedId, setSelected] = React.useState('');
    const japanese = /^ja(?:-|$)/i.test(locale);
    const select = (id: string) => controller.current?.select(id);
    return {
        context: enabled ? {selectedId, openLabel: japanese ? '開く' : 'Open', select, open: select} : null,
        renderEditor: available ? (children: React.ReactNode) => React.createElement(SpriteTabs, {
            ...props, enabled, children, selectTarget: setSelected,
            connect: next => { controller.current = next; },
            reopenLabel: japanese ? '編集中のスプライトを開く' : 'Open the editing sprite'
        }) : undefined
    };
}
