import { Tree } from '@nrwl/tao/src/shared/tree';
import {
  ProjectConfiguration,
  toNewFormat,
  WorkspaceConfiguration,
} from '@nrwl/tao/src/shared/workspace';
import { readJson, updateJson } from '../utils/json';
import {
  NxJsonConfiguration,
  NxJsonProjectConfiguration,
} from '@nrwl/tao/src/shared/nx';
import { getWorkspacePath } from '../utils/get-workspace-layout';

/**
 * Adds project configuration to the Nx workspace.
 *
 * The project configuration is stored in workspace.json and nx.json. The utility will update
 * both files.
 *
 * @param host - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 * @param projectConfiguration - project configuration
 */
export function addProjectConfiguration(
  host: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration & NxJsonProjectConfiguration
) {
  setProjectConfiguration(host, projectName, projectConfiguration, 'create');
}

/**
 * Updates the configuration of an existing project.
 *
 * The project configuration is stored in workspace.json and nx.json. The utility will update
 * both files.
 *
 * @param host - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 * @param projectConfiguration - project configuration
 */
export function updateProjectConfiguration(
  host: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration & NxJsonProjectConfiguration
) {
  setProjectConfiguration(host, projectName, projectConfiguration, 'update');
}

/**
 * Removes the configuration of an existing project.
 *
 * The project configuration is stored in workspace.json and nx.json.
 * The utility will update both files.
 */
export function removeProjectConfiguration(host: Tree, projectName: string) {
  setProjectConfiguration(host, projectName, undefined, 'delete');
}

/**
 * Get a map of all projects in a workspace.
 *
 * Use {@link readProjectConfiguration} if only one project is needed.
 */
export function getProjects(host: Tree) {
  const workspace = readWorkspace(host);
  const nxJson = readJson<NxJsonConfiguration>(host, 'nx.json');

  return new Map(
    Object.keys(workspace.projects).map((projectName) => {
      return [
        projectName,
        getProjectConfiguration(projectName, workspace, nxJson),
      ];
    })
  );
}

/**
 * Read general workspace configuration such as the default project or cli settings
 *
 * This does _not_ provide projects configuration, use {@link readProjectConfiguration} instead.
 */
export function readWorkspaceConfiguration(
  host: Tree
): Omit<WorkspaceConfiguration, 'projects'> {
  const workspace = readWorkspace(host);
  delete workspace.projects;
  return workspace;
}

/**
 * Update general workspace configuration such as the default project or cli settings.
 *
 * This does _not_ update projects configuration, use {@link updateProjectConfiguration} or {@link addProjectConfiguration} instead.
 */
export function updateWorkspaceConfiguration(
  host: Tree,
  workspace: Omit<WorkspaceConfiguration, 'projects'>
) {
  updateJson<WorkspaceConfiguration>(host, getWorkspacePath(host), (json) => {
    return { ...workspace, projects: json.projects };
  });
}

/**
 * Reads a project configuration.
 *
 * The project configuration is stored in workspace.json and nx.json. The utility will read
 * both files.
 *
 * @param host - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 */
export function readProjectConfiguration(host: Tree, projectName: string) {
  const workspace = readWorkspace(host);
  if (!workspace.projects[projectName]) {
    throw new Error(
      `Cannot find configuration for '${projectName}' in ${getWorkspacePath(
        host
      )}.`
    );
  }

  const nxJson = readJson<NxJsonConfiguration>(host, 'nx.json');
  if (!nxJson.projects[projectName]) {
    throw new Error(
      `Cannot find configuration for '${projectName}' in nx.json`
    );
  }

  return getProjectConfiguration(projectName, workspace, nxJson);
}

function getProjectConfiguration(
  projectName: string,
  workspace: WorkspaceConfiguration,
  nxJson: NxJsonConfiguration
): ProjectConfiguration & NxJsonProjectConfiguration {
  return {
    ...readWorkspaceSection(workspace, projectName),
    ...readNxJsonSection(nxJson, projectName),
  };
}

function readWorkspaceSection(
  workspace: WorkspaceConfiguration,
  projectName: string
) {
  return workspace.projects[projectName] as ProjectConfiguration;
}

function readNxJsonSection(nxJson: NxJsonConfiguration, projectName: string) {
  return nxJson.projects[projectName];
}

function setProjectConfiguration(
  host: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration & NxJsonProjectConfiguration,
  mode: 'create' | 'update' | 'delete'
) {
  if (mode === 'delete') {
    addProjectToNxJson(host, projectName, undefined, mode);
    addProjectToWorkspaceJson(host, projectName, undefined, mode);
    return;
  }

  if (!projectConfiguration) {
    throw new Error(
      `Cannot ${mode} "${projectName}" with value ${projectConfiguration}`
    );
  }

  const {
    tags,
    implicitDependencies,
    ...workspaceConfiguration
  } = projectConfiguration;
  addProjectToWorkspaceJson(host, projectName, workspaceConfiguration, mode);
  addProjectToNxJson(
    host,
    projectName,
    {
      tags,
      implicitDependencies,
    },
    mode
  );
}

function addProjectToWorkspaceJson(
  host: Tree,
  projectName: string,
  project: ProjectConfiguration,
  mode: 'create' | 'update' | 'delete'
) {
  const path = getWorkspacePath(host);
  const workspaceJson = readJson<WorkspaceConfiguration>(host, path);
  if (mode == 'create' && workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot create Project '${projectName}'. It already exists.`
    );
  }
  if (mode == 'update' && !workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot update Project '${projectName}'. It does not exist.`
    );
  }
  if (mode == 'delete' && !workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot update Project '${projectName}'. It does not exist.`
    );
  }
  workspaceJson.projects[projectName] = project;
  host.write(path, JSON.stringify(workspaceJson));
}

function addProjectToNxJson(
  host: Tree,
  projectName: string,
  config: NxJsonProjectConfiguration,
  mode: 'create' | 'update' | 'delete'
) {
  const nxJson = readJson<NxJsonConfiguration>(host, 'nx.json');
  if (mode === 'delete') {
    delete nxJson.projects[projectName];
  } else {
    nxJson.projects[projectName] = {
      ...{
        tags: [],
      },
      ...(config || {}),
    };
  }
  host.write('nx.json', JSON.stringify(nxJson));
}

function readWorkspace(host: Tree): WorkspaceConfiguration {
  const path = getWorkspacePath(host);
  const workspaceJson = readJson<WorkspaceConfiguration>(host, path);
  const originalVersion = workspaceJson.version;
  return {
    ...toNewFormat(workspaceJson),
    version: originalVersion,
  };
}