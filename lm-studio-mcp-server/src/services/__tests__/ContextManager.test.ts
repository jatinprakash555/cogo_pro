import { ContextManager } from '../ContextManager.js';
import { ProjectContext } from '../../types/index.js';
import { initializeLogger } from '../../utils/logger.js';
import { loadConfig } from '../../config/index.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    const config = loadConfig();
    initializeLogger(config);
    contextManager = new ContextManager();
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count correctly', () => {
      const text = 'Hello world, this is a test';
      const tokens = contextManager.estimateTokenCount(text);
      
      // Rough estimation: ~4 characters per token
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('buildPromptContext', () => {
    it('should build comprehensive prompt context', () => {
      const mockContext: ProjectContext = {
        workspacePath: '/test/project',
        activeFiles: [
          {
            path: 'src/index.ts',
            content: 'console.log("Hello");',
            language: 'typescript',
            relevanceScore: 10,
            lastModified: new Date()
          }
        ],
        projectStructure: {
          name: 'project',
          path: '/test/project',
          type: 'directory'
        },
        dependencies: [
          { name: 'express', version: '4.18.0', type: 'prod' },
          { name: 'jest', version: '29.0.0', type: 'dev' }
        ],
        gitContext: {
          branch: 'main',
          lastCommit: 'abc123',
          uncommittedChanges: true
        }
      };

      const request = 'Analyze this code';
      const promptContext = contextManager.buildPromptContext(request, mockContext);

      expect(promptContext).toContain('# Project Context');
      expect(promptContext).toContain('Workspace: /test/project');
      expect(promptContext).toContain('Branch: main');
      expect(promptContext).toContain('Last commit: abc123');
      expect(promptContext).toContain('Uncommitted changes present');
      expect(promptContext).toContain('## Dependencies');
      expect(promptContext).toContain('Production: express@4.18.0');
      expect(promptContext).toContain('Development: jest@29.0.0');
      expect(promptContext).toContain('## Relevant Files');
      expect(promptContext).toContain('src/index.ts (typescript)');
      expect(promptContext).toContain('console.log("Hello");');
      expect(promptContext).toContain('## Request');
      expect(promptContext).toContain('Analyze this code');
    });
  });

  describe('gatherProjectContext', () => {
    beforeEach(() => {
      // Mock file system operations
      mockedFs.stat.mockImplementation(async (filePath) => {
        if (filePath.toString().includes('package.json')) {
          return { isFile: () => true, isDirectory: () => false, size: 1000, mtime: new Date() } as any;
        }
        return { isFile: () => false, isDirectory: () => true, size: 0, mtime: new Date() } as any;
      });

      mockedFs.readdir.mockResolvedValue(['src', 'package.json'] as any);
      
      mockedFs.readFile.mockImplementation(async (filePath) => {
        if (filePath.toString().includes('package.json')) {
          return JSON.stringify({
            dependencies: { express: '4.18.0' },
            devDependencies: { jest: '29.0.0' }
          });
        }
        return 'console.log("test");';
      });

      mockedFs.access.mockRejectedValue(new Error('Not found')); // No .git directory
    });

    it('should gather project context successfully', async () => {
      const context = await contextManager.gatherProjectContext('/test/project');

      expect(context.workspacePath).toBe('/test/project');
      expect(context.dependencies).toHaveLength(2);
      expect(context.dependencies[0]).toEqual({ name: 'express', version: '4.18.0', type: 'prod' });
      expect(context.dependencies[1]).toEqual({ name: 'jest', version: '29.0.0', type: 'dev' });
      expect(context.projectStructure.name).toBe('project');
      expect(context.gitContext).toBeUndefined();
    });
  });

  describe('pruneContext', () => {
    it('should prune context when over token limit', () => {
      const mockContext: ProjectContext = {
        workspacePath: '/test',
        activeFiles: [
          {
            path: 'file1.ts',
            content: 'a'.repeat(1000), // ~250 tokens
            language: 'typescript',
            relevanceScore: 10,
            lastModified: new Date()
          },
          {
            path: 'file2.ts',
            content: 'b'.repeat(1000), // ~250 tokens
            language: 'typescript',
            relevanceScore: 5,
            lastModified: new Date()
          }
        ],
        projectStructure: { name: 'test', path: '/test', type: 'directory' },
        dependencies: []
      };

      contextManager.updateContext(mockContext);
      contextManager.pruneContext(300); // Should keep only the most relevant file

      const prunedContext = contextManager.getCurrentContext();
      expect(prunedContext?.activeFiles).toHaveLength(1);
      expect(prunedContext?.activeFiles[0].path).toBe('file1.ts'); // Higher relevance score
    });
  });

  describe('updateContext', () => {
    it('should update existing context', () => {
      const initialContext: ProjectContext = {
        workspacePath: '/test',
        activeFiles: [],
        projectStructure: { name: 'test', path: '/test', type: 'directory' },
        dependencies: []
      };

      contextManager.updateContext(initialContext);
      
      const update = {
        activeFiles: [{
          path: 'new-file.ts',
          content: 'new content',
          language: 'typescript',
          relevanceScore: 8,
          lastModified: new Date()
        }]
      };

      contextManager.updateContext(update);

      const updatedContext = contextManager.getCurrentContext();
      expect(updatedContext?.activeFiles).toHaveLength(1);
      expect(updatedContext?.activeFiles[0].path).toBe('new-file.ts');
    });
  });
});