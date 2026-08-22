import { projectOrderAfterInsertion, projectForGrant, shortcutProject } from "./model";
import type {
  ProjectActionResult,
  ProjectWorkbenchAdapter,
  ProjectWorkbenchSnapshot,
} from "./types";

/** Project lifecycle commands with all authority and state changes injected. */
export class ProjectsController {
  constructor(readonly adapter: ProjectWorkbenchAdapter) {}

  snapshot(): ProjectWorkbenchSnapshot {
    return this.adapter.snapshot();
  }

  subscribe(listener: (snapshot: ProjectWorkbenchSnapshot) => void): () => void {
    return this.adapter.subscribe(listener);
  }

  async addProject(): Promise<ProjectActionResult | null> {
    const grant = await this.adapter.chooseProject();
    if (!grant) return null;

    const existing = projectForGrant(this.snapshot().projects, grant);
    return existing
      ? this.adapter.activateProject(existing.id)
      : this.adapter.acceptChosenProject(grant);
  }

  activateProject(projectId: string): Promise<ProjectActionResult> {
    return this.adapter.activateProject(projectId);
  }

  async activateShortcut(slot: number): Promise<ProjectActionResult | null> {
    const project = shortcutProject(this.snapshot().projects, slot);
    return project ? this.adapter.activateProject(project.id) : null;
  }

  async moveProject(
    projectId: string,
    insertionIndex: number,
  ): Promise<ProjectActionResult | null> {
    const orderedIds = projectOrderAfterInsertion(
      this.snapshot().projects,
      projectId,
      insertionIndex,
    );
    return orderedIds ? this.adapter.reorderProjects(orderedIds) : null;
  }

  removeProject(projectId: string): Promise<ProjectActionResult> {
    return this.adapter.removeProject(projectId);
  }

  recoverProject(projectId: string): Promise<ProjectActionResult> {
    return this.adapter.recoverProject(projectId);
  }
}
