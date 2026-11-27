import React from 'react';
import {connect} from 'react-redux';
import {createAiAgents, type DesktopAiAgentsPort} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName, projectTitleGroupClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-workbench/project-info-menu';
import logo from '../extension-library/icon.svg';
import {projectFormatSource} from './index.ts';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

declare const __TW_PLUS_EDITOR_VERSION__: string;

const preload = (globalThis as {EditorPreload?: {
    aiAgents?: DesktopAiAgentsPort | null;
    openAbout?(): void;
    openPrivacy?(): void;
}}).EditorPreload;
const desktop = preload?.aiAgents;
export const aiAgents = createAiAgents(React, {styles, desktop});
const {standardLayout} = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search);

function ProjectInfoMenuView({vm, ...props}: ProjectSettingsMenuProps & {locale: string; vm?: object}) {
    const formatProps = vm ? {projectFormat: projectFormatSource(vm)} : {};
    // The GitHub connection mode is set in the Git panel at the side, where Git is set up.
    return <>
        <InfoMenu {...props} {...formatProps} version={__TW_PLUS_EDITOR_VERSION__} logo={logo}
            openAbout={desktop ? preload.openAbout : undefined}
            openPrivacy={desktop ? preload.openPrivacy : undefined}
            sourceUrl={desktop ? 'https://github.com/kubohiroya/turbowarp-plus-desktop' : undefined}
            aiAgents={standardLayout ? {
                icon: aiAgents.settingsIcon(),
                // Focus returns to the Plus icon, since the menu entry is hidden once the menu closes.
                onClick: event => aiAgents.openSettings({locale: props.locale,
                    returnFocus: event.currentTarget.closest('details')?.querySelector('summary')})
            } : undefined} />
    </>;
}

const connectVM = connect((state: {scratchGui: {vm?: object}}) => ({vm: state.scratchGui.vm}));
export const ProjectInfoMenu = Object.assign(connectVM(ProjectInfoMenuView), {
    reorganizeMenuBar: true,
    titleFieldClassName: projectTitleFieldClassName,
    titleGroupClassName: projectTitleGroupClassName
});
