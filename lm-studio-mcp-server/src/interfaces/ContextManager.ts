import { ProjectContext } from '../types/index.js';

export interface ContextManager {
  gatherProjectContext(workspacePath: string): Promise<ProjectContext>;
  buildPromptContext(request: string, context: ProjectContext): string;
  updateContext(newContext: Partial<ProjectContext>): void;
  pruneContext(maxTokens: number): void;
  getCurrentContext(): ProjectContext | null;
  estimateTokenCount(text: string): number;
}