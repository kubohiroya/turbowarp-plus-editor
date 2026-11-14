import React from 'react';
import {createAiAgents, type DesktopAiAgentsPort} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName, projectTitleGroupClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-ui/project-info-menu';
import {GitConnectionPreferences} from '@kubohiroya/turbowarp-plus-editor-git';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';
import {availableGitConnectionModes} from '../project-folder-host.ts';
import logo from '../extension-library/icon.svg';

declare const __TW_PLUS_EDITOR_VERSION__: string;

const preload = (globalThis as {EditorPreload?: {
    aiAgents?: DesktopAiAgentsPort | null;
    openAbout?(): void;
    openPrivacy?(): void;
}}).EditorPreload;
const desktop = preload?.aiAgents;
export const aiAgents = createAiAgents(React, {styles, desktop});
const gitEnabled = typeof window !== 'undefined' && readWebStartupFeatureFlags(window.location.search).localGit;

export function ProjectInfoMenu(props: ProjectSettingsMenuProps & {locale: string}) {
    const [githubSettings, setGitHubSettings] = React.useState<HTMLElement | null>(null);
    return <>
        <InfoMenu {...props} version={__TW_PLUS_EDITOR_VERSION__} logo={logo}
            openAbout={desktop ? preload.openAbout : undefined}
            openPrivacy={desktop ? preload.openPrivacy : undefined}
            sourceUrl={desktop ? 'https://github.com/kubohiroya/turbowarp-plus-desktop' : undefined}
            githubConnection={gitEnabled ? {
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>
                </svg>,
                onClick: event => setGitHubSettings(event.currentTarget.closest('details')?.querySelector('summary') ?? null)
            } : undefined}
            aiAgents={{
                icon: aiAgents.settingsIcon(),
                // Focus returns to the Plus icon, since the menu entry is hidden once the menu closes.
                onClick: event => aiAgents.openSettings({locale: props.locale,
                    returnFocus: event.currentTarget.closest('details')?.querySelector('summary')})
            }} />
        {githubSettings && <GitConnectionPreferences view={window} modes={availableGitConnectionModes(window)}
            locale={props.locale} onClose={() => {setGitHubSettings(null); githubSettings.focus();}}/>}
    </>;
}

ProjectInfoMenu.reorganizeMenuBar = true;
ProjectInfoMenu.titleFieldClassName = projectTitleFieldClassName;
ProjectInfoMenu.titleGroupClassName = projectTitleGroupClassName;
