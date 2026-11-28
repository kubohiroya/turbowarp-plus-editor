import React from 'react';
import {connect} from 'react-redux';
import {createAiAgents, type DesktopAiAgentsPort} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName, projectTitleGroupClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-workbench/project-info-menu';
import logo from '../extension-library/icon.svg';
import {cacheManagerProject, projectFormatSource} from './index.ts';
import {useLayoutPreference, prepareLayoutChange} from '@kubohiroya/turbowarp-plus-editor-workbench/layout-preference';
import {layoutPreference} from '../editor-layout/config.ts';
import {createCacheManager} from '@kubohiroya/turbowarp-plus-editor-workbench/cache-manager';

declare const __TW_PLUS_EDITOR_VERSION__: string;

const preload = (globalThis as {EditorPreload?: {
    aiAgents?: DesktopAiAgentsPort | null;
    openAbout?(): void;
    openPrivacy?(): void;
}}).EditorPreload;
const desktop = preload?.aiAgents;
export const aiAgents = createAiAgents(React, {styles, desktop});
// The Loader cache the extension host and the project data paths write to (issue #902).
const cacheManager = createCacheManager();

function ProjectInfoMenuView({vm, dark, ...props}: ProjectSettingsMenuProps & {locale: string; vm?: object; dark?: boolean}) {
    const standardLayout = useLayoutPreference(layoutPreference);
    const formatProps = vm ? {projectFormat: projectFormatSource(vm)} : {};
    // The GitHub connection mode is set in the Git panel at the side, where Git is set up.
    return <>
        <InfoMenu {...props} {...formatProps} layoutPreference={layoutPreference}
            beforeLayoutChange={vm ? enabled => prepareLayoutChange(vm, enabled, props.locale) : undefined} version={__TW_PLUS_EDITOR_VERSION__} logo={logo}
            openAbout={desktop ? preload.openAbout : undefined}
            openPrivacy={desktop ? preload.openPrivacy : undefined}
            coursesUrl="https://kubohiroya.github.io/turbowarp-plus-packages/#category-courses"
            sourceUrl={desktop ? 'https://github.com/kubohiroya/turbowarp-plus-desktop' : undefined}
            aiAgents={standardLayout ? {
                icon: aiAgents.settingsIcon(),
                // Focus returns to the Plus icon, since the menu entry is hidden once the menu closes.
                onClick: event => aiAgents.openSettings({locale: props.locale,
                    returnFocus: event.currentTarget.closest('details')?.querySelector('summary')})
            } : undefined}
            cacheManager={{onClick: event => void cacheManager.open({locale: props.locale, colorScheme: dark ? 'dark' : 'light',
                returnFocus: event.currentTarget.closest('details')?.querySelector('summary'),
                project: vm ? cacheManagerProject(vm) : undefined})}} />
    </>;
}

const connectVM = connect((state: {scratchGui: {vm?: object; theme?: {theme?: {isDark?(): boolean}}}}) => ({
    vm: state.scratchGui.vm, dark: state.scratchGui.theme?.theme?.isDark?.() ?? false}));
export const ProjectInfoMenu = Object.assign(connectVM(ProjectInfoMenuView), {
    reorganizeMenuBar: true,
    titleFieldClassName: projectTitleFieldClassName,
    titleGroupClassName: projectTitleGroupClassName
});
