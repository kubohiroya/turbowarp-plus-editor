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
type SearchNavigation = {
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
