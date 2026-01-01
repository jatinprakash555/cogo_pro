import { ContextManager } from '../services/ContextManager.js';
import { ModelManager } from '../services/ModelManager.js';
import { LMStudioClient } from '../services/LMStudioClient.js';
import { initializeLogger } from '../utils/logger.js';
import { loadConfig } from '../config/index.js';
import fs from 'fs/promises';
import path from 'path';

const runPerformanceTests = process.env.PERFORMANCE_TESTS === 'true';

describe('Performance Tests', () => {
  let contextManager: ContextManager;
  let modelManager: ModelManager;
  let lmStudioClient: LMStudioClient;

  beforeAll(async () => {
    if (!runPerformanceTests) {
      console.log('Skipping performance tests. Set PERFORMANCE_TESTS=true to run them.');
      return;
    }

    const config = await loadConfig();
    initializeLogger(config);

    contextManager = new ContextManager();
    lmStudioClient = new LMStudioClient();
    modelManager = new ModelManager(lmStudioClient);
  });

  describe('Context Processing Performance', () => {
    it('should process large project context efficiently', async () => {
      if (!runPerformanceTests) return;

      const startTime = Date.now();
      
      // Create a temporary large project structure for testing
      const tempDir = await createLargeProjectStructure();
      
      try {
        const context = await contextManager.gatherProjectContext(tempDir);
        const endTime = Date.now();
        const processingTime = endTime - startTime;

        console.log(`Context processing time: ${processingTime}ms`);
        console.log(`Files processed: ${context.activeFiles.length}`);
        console.log(`Dependencies found: ${context.dependencies.length}`);

        // Should process within reasonable time (adjust threshold as needed)
        expect(processingTime).toBeLessThan(10000); // 10 seconds
        expect(context.activeFiles.length).toBeGreaterThan(0);
      } finally {
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }, 30000);

    it('should handle context pruning efficiently', async () => {
      if (!runPerformanceTests) return;

      // Create context with large content
      const largeContext = {
        workspacePath: '/test',
        activeFiles: Array.from({ length: 100 }, (_, i) => ({
          path: `file${i}.ts`,
          content: 'x'.repeat(1000), // 1KB per file
          language: 'typescript',
          relevanceScore: Math.random() * 10,
          lastModified: new Date()
        })),
        projectStructure: { name: 'test', path: '/test', type: 'directory' as const },
        dependencies: []
      };

      contextManager.updateContext(largeContext);

      const startTime = Date.now();
      contextManager.pruneContext(2000); // Prune to 2000 tokens
      const endTime = Date.now();

      const prunedContext = contextManager.getCurrentContext();
      const processingTime = endTime - startTime;

      console.log(`Context pruning time: ${processingTime}ms`);
      console.log(`Files after pruning: ${prunedContext?.activeFiles.length}`);

      expect(processingTime).toBeLessThan(1000); // Should be fast
      expect(prunedContext?.activeFiles.length).toBeLessThan(100);
    });

    it('should estimate token count efficiently', async () => {
      if (!runPerformanceTests) return;

      const largeText = 'word '.repeat(10000); // ~40KB of text
      
      const startTime = Date.now();
      const tokenCount = contextManager.estimateTokenCount(largeText);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      console.log(`Token estimation time: ${processingTime}ms for ${largeText.length} characters`);
      console.log(`Estimated tokens: ${tokenCount}`);

      expect(processingTime).toBeLessThan(100); // Should be very fast
      expect(tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Model Management Performance', () => {
    it('should discover models quickly', async () => {
      if (!runPerformanceTests) return;

      // Mock the LM Studio client for performance testing
      const mockClient = {
        isConnected: () => true,
        listModels: async () => Array.from({ length: 10 }, (_, i) => ({
          id: `model-${i}`,
          name: `Model ${i}`,
          type: 'chat',
          contextWindow: 4096,
          capabilities: ['chat'],
          loaded: true
        })),
        loadModel: async () => {},
      } as any;

      const testModelManager = new ModelManager(mockClient);

      const startTime = Date.now();
      const models = await testModelManager.discoverModels();
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      console.log(`Model discovery time: ${processingTime}ms`);
      console.log(`Models discovered: ${models.length}`);

      expect(processingTime).toBeLessThan(1000);
      expect(models.length).toBe(10);
    });

    it('should handle model selection efficiently', async () => {
      if (!runPerformanceTests) return;

      const mockClient = {
        isConnected: () => true,
        listModels: async () => [
          { id: 'test-model', name: 'Test Model', type: 'chat', contextWindow: 4096, capabilities: ['chat'], loaded: true }
        ],
        loadModel: async () => {},
      } as any;

      const testModelManager = new ModelManager(mockClient);
      await testModelManager.discoverModels();

      const startTime = Date.now();
      await testModelManager.selectModel('test-model');
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      console.log(`Model selection time: ${processingTime}ms`);

      expect(processingTime).toBeLessThan(500);
      expect(testModelManager.getCurrentModel()?.id).toBe('test-model');
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during context operations', async () => {
      if (!runPerformanceTests) return;

      const initialMemory = process.memoryUsage();

      // Perform many context operations
      for (let i = 0; i < 100; i++) {
        const context = {
          workspacePath: `/test-${i}`,
          activeFiles: Array.from({ length: 10 }, (_, j) => ({
            path: `file${j}.ts`,
            content: `content ${i}-${j}`,
            language: 'typescript',
            relevanceScore: Math.random() * 10,
            lastModified: new Date()
          })),
          projectStructure: { name: `test-${i}`, path: `/test-${i}`, type: 'directory' as const },
          dependencies: []
        };

        contextManager.updateContext(context);
        contextManager.pruneContext(1000);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);

      // Should not increase memory significantly (adjust threshold as needed)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });
  });
});

async function createLargeProjectStructure(): Promise<string> {
  const tempDir = path.join(process.cwd(), 'temp-test-project');
  
  await fs.mkdir(tempDir, { recursive: true });
  
  // Create package.json
  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      dependencies: { express: '4.18.0', lodash: '4.17.21' },
      devDependencies: { jest: '29.0.0', typescript: '5.0.0' }
    })
  );

  // Create multiple directories with files
  const dirs = ['src', 'tests', 'utils', 'components'];
  for (const dir of dirs) {
    const dirPath = path.join(tempDir, dir);
    await fs.mkdir(dirPath, { recursive: true });
    
    // Create multiple files in each directory
    for (let i = 0; i < 20; i++) {
      const filePath = path.join(dirPath, `file${i}.ts`);
      const content = `
        // File ${i} in ${dir}
        export function function${i}() {
          return "Hello from ${dir}/file${i}";
        }
        
        export class Class${i} {
          private value = ${i};
          
          getValue() {
            return this.value;
          }
        }
      `;
      await fs.writeFile(filePath, content);
    }
  }

  return tempDir;
}