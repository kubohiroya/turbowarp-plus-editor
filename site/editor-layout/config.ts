import {createLayoutPreference} from '@kubohiroya/turbowarp-plus-editor-workbench/layout-preference';
import type {ExternalYamlFilePort} from '@kubohiroya/turbowarp-document-editor';
import {connectDesktopWorkspaceLayouts, type DesktopWorkspaceLayouts} from './desktop-workspace-layout.ts';
import {readWebStartupFeatureFlags} from '../startup-feature-flags.ts';

const startupSearch = typeof window === 'undefined' ? '' : window.location.search;
const startupParams = new URLSearchParams(startupSearch);
export const layoutPreference = createLayoutPreference({search: startupSearch});
// The Git package's player for past versions and merge candidates opens this page with twPlusStandardLayout=0
// (site/git-project-preview.ts). It has no layout menu, and the new layout's focusable stage would take the
// keyboard from the project after the green flag is clicked (Editor #920), so it keeps the flags its URL asks for.
const projectVersionPlayer = typeof window !== 'undefined' && window.location.pathname.endsWith('/git-project-preview.html');
// Keep the optional GUI hooks installed so either layout can be selected without reloading the project.
// The preference controls presentation; these flags describe the available layout services.
export const layoutFlags = readWebStartupFeatureFlags(startupSearch, projectVersionPlayer ? null : true);
export const dockviewSpriteTabsEnabled = layoutFlags.standardLayout &&
    startupParams.get('twPlusDockviewSpriteTabs') !== '0';
const desktopHost = typeof window !== 'undefined' && (window as Window & {
    EditorPreload?: {
        externalYaml?: ExternalYamlFilePort;
        /** The key the Dockview layout of an opened SB3 is kept under. */
        workspaceProjectKey?(fileId: string): string | null;
        workspaceLayouts?: DesktopWorkspaceLayouts | null;
    };
}).EditorPreload;
export const dockviewMultiViewEnabled = dockviewSpriteTabsEnabled && startupParams.get('twPlusDockview') !== '0' &&
    (typeof EditorPreload === 'undefined' || Boolean(desktopHost && desktopHost.externalYaml));
export const externalYamlPort = dockviewMultiViewEnabled && desktopHost && desktopHost.externalYaml;
export const desktopProjectKey = desktopHost && desktopHost.workspaceProjectKey;
export const desktopWorkspaceLayoutStore = desktopHost?.workspaceLayouts ?
    connectDesktopWorkspaceLayouts(desktopHost.workspaceLayouts) : undefined;
export const stageDrawerEnabled = layoutFlags.standardLayout && layoutFlags.stageDisplayMenu &&
    startupParams.get('twPlusStageDrawer') !== '0';
export const stageLauncherEnabled = stageDrawerEnabled && startupParams.get('twPlusStageLauncher') !== '0';
export const stageCanUndock = layoutFlags.stagePanel || (layoutFlags.standardLayout && layoutFlags.stageDisplayMenu);
