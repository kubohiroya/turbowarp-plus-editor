import React from 'react';
import {createAiAgents, type DesktopAiAgentsPort} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName, projectTitleGroupClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-workbench/project-info-menu';
import logo from '../extension-library/icon.svg';
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

export function ProjectInfoMenu(props: ProjectSettingsMenuProps & {locale: string}) {
    // The GitHub connection mode is set in the Git panel at the side, where Git is set up.
    return <>
        <InfoMenu {...props} version={__TW_PLUS_EDITOR_VERSION__} logo={logo}
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

ProjectInfoMenu.reorganizeMenuBar = true;
ProjectInfoMenu.titleFieldClassName = projectTitleFieldClassName;
ProjectInfoMenu.titleGroupClassName = projectTitleGroupClassName;
