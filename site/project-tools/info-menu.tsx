import React from 'react';
import {ProjectInfoMenu as InfoMenu, projectTitleFieldClassName,
    type ProjectSettingsMenuProps} from '@kubohiroya/turbowarp-plus-editor-ui/project-info-menu';
import logo from '../extension-library/icon.svg';

declare const __TW_PLUS_EDITOR_VERSION__: string;

export function ProjectInfoMenu(props: ProjectSettingsMenuProps & {locale: string}) {
    return <InfoMenu {...props} version={__TW_PLUS_EDITOR_VERSION__} logo={logo} />;
}

ProjectInfoMenu.reorganizeMenuBar = true;
ProjectInfoMenu.titleFieldClassName = projectTitleFieldClassName;
