import { lazy } from 'react';

export { projectPage } from './api/project-pages';
export type { NewProjectInput } from './components/new-project-dialog';
export { ProjectMenu } from './components/project-menu';
export type { ProjectNavigation } from './components/project-menu';
export { useProjects } from './hooks/use-projects';
export type { ProjectSummary, SaveStatus } from './hooks/use-projects';

/** 项目管理页：进入管理端「项目管理」时才下载。 */
export const ProjectManager = lazy(() => import('./components/project-manager').then(m => ({ default: m.ProjectManager })));
