import fs from 'fs/promises';
import path from 'path';
import { ContextManager as IContextManager } from '../interfaces/ContextManager.js';
import { ProjectContext, FileContext, DirectoryTree, Dependency, GitContext } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { ContextError } from '../utils/errors.js';

export class ContextManager implements IContextManager {
  private currentContext: ProjectContext | null = null;
  private readonly logger = getLogger();
  private readonly maxFileSize = 100 * 1024; // 100KB max per file
  private readonly relevantExtensions = new Set([
    '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
    '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala',
    '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css',
    '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore'
  ]);

  async gatherProjectContext(workspacePath: string): Promise<ProjectContext> {
    try {
      // Validate workspace path exists
      await fs.access(workspacePath);
      const stats = await fs.stat(workspacePath);
      if (!stats.isDirectory()) {
        throw new ContextError(`Workspace path is not a directory: ${workspacePath}`);
      }

      this.logger.info(`Gathering project context for: ${workspacePath}`);
      
      const [projectStructure, dependencies, gitContext] = await Promise.allSettled([
        this.buildDirectoryTree(workspacePath),
        this.extractDependencies(workspacePath),
        this.getGitContext(workspacePath)
      ]);

      const activeFiles = await this.gatherRelevantFiles(workspacePath);

      this.currentContext = {
        workspacePath,
        activeFiles,
        projectStructure: projectStructure.status === 'fulfilled' ? projectStructure.value : {
          name: path.basename(workspacePath),
          path: workspacePath,
          type: 'directory'
        },
        dependencies: dependencies.status === 'fulfilled' ? dependencies.value : [],
        gitContext: gitContext.status === 'fulfilled' ? gitContext.value : undefined
      };

      this.logger.info(`Context gathered: ${activeFiles.length} files, ${this.currentContext.dependencies.length} dependencies`);
      return this.currentContext;
    } catch (error) {
      const contextError = new ContextError(
        `Failed to gather project context for ${workspacePath}`,
        error instanceof Error ? error : new Error(String(error))
      );
      this.logger.error('Context gathering failed:', contextError);
      throw contextError;
    }
  }

  buildPromptContext(request: string, context: ProjectContext): string {
    const sections: string[] = [];

    // Add project overview
    sections.push(`# Project Context`);
    sections.push(`Workspace: ${context.workspacePath}`);
    
    if (context.gitContext) {
      sections.push(`Branch: ${context.gitContext.branch}`);
      sections.push(`Last commit: ${context.gitContext.lastCommit}`);
      if (context.gitContext.uncommittedChanges) {
        sections.push(`Status: Uncommitted changes present`);
      }
    }

    // Add dependencies
    if (context.dependencies.length > 0) {
      sections.push(`\n## Dependencies`);
      const prodDeps = context.dependencies.filter(d => d.type === 'prod');
      const devDeps = context.dependencies.filter(d => d.type === 'dev');
      
      if (prodDeps.length > 0) {
        sections.push(`Production: ${prodDeps.map(d => `${d.name}@${d.version}`).join(', ')}`);
      }
      if (devDeps.length > 0) {
        sections.push(`Development: ${devDeps.map(d => `${d.name}@${d.version}`).join(', ')}`);
      }
    }

    // Add relevant files (sorted by relevance)
    const sortedFiles = context.activeFiles
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10); // Limit to top 10 most relevant files

    if (sortedFiles.length > 0) {
      sections.push(`\n## Relevant Files`);
      for (const file of sortedFiles) {
        sections.push(`\n### ${file.path} (${file.language})`);
        sections.push('```' + file.language);
        sections.push(file.content);
        sections.push('```');
      }
    }

    // Add the actual request
    sections.push(`\n## Request`);
    sections.push(request);

    return sections.join('\n');
  }

  updateContext(newContext: Partial<ProjectContext>): void {
    if (!this.currentContext) {
      this.logger.warn('No current context to update');
      return;
    }

    this.currentContext = { ...this.currentContext, ...newContext };
    this.logger.debug('Context updated');
  }

  pruneContext(maxTokens: number): void {
    if (!this.currentContext) {
      return;
    }

    // Estimate current token count
    const currentTokens = this.estimateTokenCount(JSON.stringify(this.currentContext));
    
    if (currentTokens <= maxTokens) {
      return;
    }

    this.logger.info(`Pruning context from ~${currentTokens} to ~${maxTokens} tokens`);

    // Remove least relevant files first
    const sortedFiles = this.currentContext.activeFiles
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    let estimatedTokens = currentTokens;
    const filesToKeep: FileContext[] = [];

    for (const file of sortedFiles) {
      const fileTokens = this.estimateTokenCount(file.content);
      if (estimatedTokens - fileTokens > maxTokens * 0.8) { // Keep some buffer
        estimatedTokens -= fileTokens;
      } else {
        filesToKeep.push(file);
      }
    }

    this.currentContext.activeFiles = filesToKeep;
    this.logger.info(`Context pruned to ${filesToKeep.length} files`);
  }

  getCurrentContext(): ProjectContext | null {
    return this.currentContext;
  }

  estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a simplified estimation, real tokenization would be more accurate
    return Math.ceil(text.length / 4);
  }

  private async buildDirectoryTree(dirPath: string, maxDepth: number = 3, currentDepth: number = 0): Promise<DirectoryTree> {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);

    if (stats.isFile()) {
      return {
        name,
        path: dirPath,
        type: 'file'
      };
    }

    const tree: DirectoryTree = {
      name,
      path: dirPath,
      type: 'directory',
      children: []
    };

    if (currentDepth >= maxDepth) {
      return tree;
    }

    try {
      const entries = await fs.readdir(dirPath);
      const children = await Promise.all(
        entries
          .filter(entry => !this.shouldIgnoreEntry(entry))
          .map(async entry => {
            const fullPath = path.join(dirPath, entry);
            try {
              return await this.buildDirectoryTree(fullPath, maxDepth, currentDepth + 1);
            } catch (error) {
              // Skip entries that can't be accessed
              return null;
            }
          })
      );

      tree.children = children.filter(child => child !== null) as DirectoryTree[];
    } catch (error) {
      // If we can't read the directory, return it without children
      this.logger.debug(`Cannot read directory ${dirPath}:`, error);
    }

    return tree;
  }

  private async gatherRelevantFiles(workspacePath: string): Promise<FileContext[]> {
    const files: FileContext[] = [];
    
    try {
      await this.collectFiles(workspacePath, files, 0, 3);
    } catch (error) {
      this.logger.error('Error collecting files:', error);
    }

    return files;
  }

  private async collectFiles(dirPath: string, files: FileContext[], currentDepth: number, maxDepth: number): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        if (this.shouldIgnoreEntry(entry)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          await this.collectFiles(fullPath, files, currentDepth + 1, maxDepth);
        } else if (stats.isFile() && this.isRelevantFile(entry) && stats.size <= this.maxFileSize) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const language = this.getLanguageFromExtension(path.extname(entry));
            const relevanceScore = this.calculateRelevanceScore(entry, content);

            files.push({
              path: path.relative(process.cwd(), fullPath),
              content,
              language,
              relevanceScore,
              lastModified: stats.mtime
            });
          } catch (error) {
            // Skip files that can't be read
            this.logger.debug(`Cannot read file ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Cannot read directory ${dirPath}:`, error);
    }
  }

  private shouldIgnoreEntry(entry: string): boolean {
    const ignorePatterns = [
      'node_modules', '.git', '.svn', '.hg',
      'dist', 'build', 'target', 'bin', 'obj',
      '.DS_Store', 'Thumbs.db', '.vscode', '.idea',
      '*.log', '*.tmp', '*.cache'
    ];

    return ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(entry);
      }
      return entry === pattern;
    });
  }

  private isRelevantFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.relevantExtensions.has(ext);
  }

  private getLanguageFromExtension(ext: string): string {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.js': 'javascript',
      '.tsx': 'tsx',
      '.jsx': 'jsx',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bat': 'batch',
      '.ps1': 'powershell'
    };

    return languageMap[ext.toLowerCase()] || 'text';
  }

  private calculateRelevanceScore(filename: string, content: string): number {
    let score = 0;

    // Base score for different file types
    const ext = path.extname(filename).toLowerCase();
    if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) score += 10;
    if (['.py', '.java', '.cpp', '.c'].includes(ext)) score += 8;
    if (['.md', '.txt'].includes(ext)) score += 5;
    if (['.json', '.yaml', '.yml'].includes(ext)) score += 3;

    // Boost for important files
    const importantFiles = ['package.json', 'tsconfig.json', 'README.md', 'index.ts', 'index.js', 'main.ts', 'main.js'];
    if (importantFiles.includes(path.basename(filename))) score += 15;

    // Boost for recently modified files (would need file stats)
    // This is a placeholder - in real implementation, check file modification time

    // Content-based scoring
    const lines = content.split('\n').length;
    if (lines > 10 && lines < 500) score += 5; // Sweet spot for meaningful files
    if (lines > 500) score -= 2; // Penalize very large files

    // Boost for files with imports/exports (likely important)
    if (content.includes('import ') || content.includes('export ')) score += 3;
    if (content.includes('function ') || content.includes('class ')) score += 2;

    return Math.max(0, score);
  }

  private async extractDependencies(workspacePath: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    try {
      // Try to read package.json
      const packageJsonPath = path.join(workspacePath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        if (packageJson.dependencies) {
          for (const [name, version] of Object.entries(packageJson.dependencies)) {
            dependencies.push({ name, version: version as string, type: 'prod' });
          }
        }
        
        if (packageJson.devDependencies) {
          for (const [name, version] of Object.entries(packageJson.devDependencies)) {
            dependencies.push({ name, version: version as string, type: 'dev' });
          }
        }
      } catch (error) {
        // package.json doesn't exist or is invalid
      }

      // Could add support for other dependency files (requirements.txt, pom.xml, etc.)
      
    } catch (error) {
      this.logger.debug('Error extracting dependencies:', error);
    }

    return dependencies;
  }

  private async getGitContext(workspacePath: string): Promise<GitContext | undefined> {
    try {
      const gitDir = path.join(workspacePath, '.git');
      await fs.access(gitDir);

      // This is a simplified implementation
      // In a real implementation, you'd use a git library like simple-git
      const headPath = path.join(gitDir, 'HEAD');
      const head = await fs.readFile(headPath, 'utf-8');
      
      let branch = 'main';
      if (head.startsWith('ref: refs/heads/')) {
        branch = head.replace('ref: refs/heads/', '').trim();
      }

      return {
        branch,
        lastCommit: 'unknown', // Would need git library to get actual commit
        uncommittedChanges: false // Would need git library to check status
      };
    } catch (error) {
      // Not a git repository or can't access git info
      return undefined;
    }
  }
}