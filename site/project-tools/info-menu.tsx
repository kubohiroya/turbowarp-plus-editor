import React from 'react';
import {createAiAgents} from '@kubohiroya/turbowarp-plus-editor-workbench/ai-agents';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-ui/project-info-menu';
import logo from '../extension-library/icon.svg';

declare const __TW_PLUS_EDITOR_VERSION__: string;

const aiAgents = createAiAgents(React, {styles});

export function ProjectInfoMenu(props: ProjectSettingsMenuProps & {locale: string}) {
    return <InfoMenu {...props} version={__TW_PLUS_EDITOR_VERSION__} logo={logo} aiAgents={{
        icon: aiAgents.settingsIcon(),
        // Focus returns to the Plus icon, since the menu entry is hidden once the menu closes.
        onClick: event => aiAgents.openSettings({locale: props.locale,
            returnFocus: event.currentTarget.closest('details')?.querySelector('summary')})
    }} />;
}

ProjectInfoMenu.reorganizeMenuBar = true;
ProjectInfoMenu.titleFieldClassName = projectTitleFieldClassName;
