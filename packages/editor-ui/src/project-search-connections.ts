import type {ProjectSearchResult, SearchProject, YamlSearchDocument, YamlSearchResult} from './project-search.ts';
import type {ReplaceBlockly, ReplaceWorkspace} from './project-search-replace.ts';

export type SearchDocuments = {
    getSearchableYamlDocuments(): readonly YamlSearchDocument[];
    openYamlPreview(reference: YamlSearchDocument['reference'], range: YamlSearchResult['range']): boolean;
    stageYamlReplacement?(reference: YamlSearchDocument['reference'], range: YamlSearchResult['range'],
        source: string, text: string): boolean;
};

type SearchView = {id: string; groupId: string; targetId: string; section: number};
type SearchViews = {
    views(): SearchView[];
    currentView(): SearchView | undefined;
    activateView(id: string): boolean;
    select(id: string): void;
    setViewSection(id: string, section: number): boolean;
    selectAsset(id: string, kind: 'costumes' | 'sounds', index: number): void;
};
type Target = ProjectSearchResult['target'];
export type SearchNavigation = {
    getViews(): SearchViews | null;
    getTarget(id: string): Target | undefined;
    getEditingTarget(): Target | undefined;
    centerBlock(id: string): void;
    centerComment(id: string, blockId?: string | null): void;
    replacementContext?(): {workspace: ReplaceWorkspace; Blockly: ReplaceBlockly} | undefined;
};

type SearchConnection = {
    navigation?: SearchNavigation;
    documents?: SearchDocuments;
    openReplace?: () => void;
    listeners: Set<() => void>;
};

const connections = new WeakMap<SearchProject, SearchConnection>();

export function connectionFor(project: SearchProject) {
    let connection = connections.get(project);
    if (!connection) {
        connection = {listeners: new Set()};
        connections.set(project, connection);
    }
    return connection;
}

/** Open a target's view in the active group and switch it to a section. */
export function activateTargetView(navigation: SearchNavigation, targetId: string, section: number) {
    const views = navigation.getViews();
    if (!views) return undefined;
    const groupId = views.currentView()?.groupId;
    const local = views.views().find(view => view.groupId === groupId && view.targetId === targetId);
    if (local) views.activateView(local.id);
    else views.select(targetId);
    const destination = views.currentView();
    if (destination?.targetId !== targetId) return undefined;
    views.setViewSection(destination.id, section);
    return {views, viewId: destination.id, section};
}

export function connectProjectSearchNavigation(project: SearchProject, navigation: SearchNavigation) {
    const connection = connectionFor(project);
    connection.navigation = navigation;
    connection.listeners.forEach(listener => listener());
    return () => {
        if (connection.navigation !== navigation) return;
        connection.navigation = undefined;
        connection.listeners.forEach(listener => listener());
    };
}

export function connectProjectSearchDocuments(project: SearchProject, documents: SearchDocuments) {
    const connection = connectionFor(project);
    connection.documents = documents;
    connection.listeners.forEach(listener => listener());
    return () => {
        if (connection.documents !== documents) return;
        connection.documents = undefined;
        connection.listeners.forEach(listener => listener());
    };
}

export function connectProjectReplaceOpener(project: SearchProject, open: () => void) {
    const connection = connectionFor(project);
    connection.openReplace = open;
    return () => {
        if (connection.openReplace === open) connection.openReplace = undefined;
    };
}

export function projectReplaceOpener(project?: SearchProject) {
    return project && connections.get(project)?.openReplace;
}

const replaceKey = 'F';

export const projectReplaceShortcut = {
    keys: `Control+Shift+${replaceKey}`,
    label: `Ctrl+Shift+${replaceKey}`,
    macLabel: `⌃⇧${replaceKey}`,
    matches(event: KeyboardEvent) {
        return event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && !event.isComposing &&
            event.key.toUpperCase() === replaceKey;
    }
};
