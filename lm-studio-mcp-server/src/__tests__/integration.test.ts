import { MCPServer } from '../server/MCPServer.js';
import { LMStudioClient } from '../services/LMStudioClient.js';
import { ModelManager } from '../services/ModelManager.js';
import { ContextManager } from '../services/ContextManager.js';
import { EndpointDiscovery } from '../services/EndpointDiscovery.js';
import { loadConfig, validateEnvironment } from '../config/index.js';
import { initializeLogger } from '../utils/logger.js';

// These tests require a running LM Studio instance
// Set INTEGRATION_TESTS=true to run them
const runIntegrationTests = process.env.INTEGRATION_TESTS === 'true';

describe('Integration Tests', () => {
  let mcpServer: MCPServer;
  let lmStudioClient: LMStudioClient;
  let modelManager: ModelManager;
  let contextManager: ContextManager;
  let discovery: EndpointDiscovery;

  beforeAll(async () => {
    if (!runIntegrationTests) {
      console.log('Skipping integration tests. Set INTEGRATION_TESTS=true to run them.');
      return;
    }

    // Validate environment
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      throw new Error(`Environment validation failed: ${envValidation.issues.join(', ')}`);
    }

    // Load configuration
    const config = await loadConfig();
    initializeLogger(config);

    // Initialize services
    lmStudioClient = new LMStudioClient();
    modelManager = new ModelManager(lmStudioClient, config.defaultModel);
    contextManager = new ContextManager();
    discovery = new EndpointDiscovery();

    mcpServer = new MCPServer(config, lmStudioClient, modelManager, contextManager);
  }, 30000);

  afterAll(async () => {
    if (runIntegrationTests && mcpServer) {
      await mcpServer.shutdown();
    }
  });

  describe('Endpoint Discovery', () => {
    it('should discover LM Studio endpoints', async () => {
      if (!runIntegrationTests) return;

      const endpoints = await discovery.discoverLMStudioEndpoints();
      expect(Array.isArray(endpoints)).toBe(true);
      
      if (endpoints.length > 0) {
        expect(endpoints[0]).toHaveProperty('endpoint');
        expect(endpoints[0]).toHaveProperty('models');
        expect(endpoints[0]).toHaveProperty('responseTime');
      }
    }, 15000);

    it('should find best endpoint', async () => {
      if (!runIntegrationTests) return;

      const bestEndpoint = await discovery.findBestEndpoint();
      
      if (bestEndpoint) {
        expect(typeof bestEndpoint).toBe('string');
        expect(bestEndpoint).toMatch(/^https?:\/\/.+:\d+$/);
      }
    }, 15000);
  });

  describe('LM Studio Client', () => {
    it('should connect to LM Studio', async () => {
      if (!runIntegrationTests) return;

      const bestEndpoint = await discovery.findBestEndpoint();
      if (!bestEndpoint) {
        console.log('No LM Studio endpoint found, skipping client tests');
        return;
      }

      await lmStudioClient.connect(bestEndpoint);
      expect(lmStudioClient.isConnected()).toBe(true);
    }, 10000);

    it('should list available models', async () => {
      if (!runIntegrationTests || !lmStudioClient.isConnected()) return;

      const models = await lmStudioClient.listModels();
      expect(Array.isArray(models)).toBe(true);
      
      if (models.length > 0) {
        expect(models[0]).toHaveProperty('id');
        expect(models[0]).toHaveProperty('name');
        expect(models[0]).toHaveProperty('contextWindow');
      }
    }, 10000);

    it('should send request and receive response', async () => {
      if (!runIntegrationTests || !lmStudioClient.isConnected()) return;

      const response = await lmStudioClient.sendRequest('Hello, how are you?', {
        maxTokens: 50,
        temperature: 0.7
      });

      expect(response).toHaveProperty('choices');
      expect(Array.isArray(response.choices)).toBe(true);
      expect(response.choices.length).toBeGreaterThan(0);
      expect(response.choices[0]).toHaveProperty('message');
      expect(response.choices[0].message).toHaveProperty('content');
    }, 15000);
  });

  describe('Model Manager', () => {
    it('should discover and manage models', async () => {
      if (!runIntegrationTests || !lmStudioClient.isConnected()) return;

      const models = await modelManager.discoverModels();
      expect(Array.isArray(models)).toBe(true);

      if (models.length > 0) {
        const firstModel = models[0];
        await modelManager.selectModel(firstModel.id);
        
        const currentModel = modelManager.getCurrentModel();
        expect(currentModel?.id).toBe(firstModel.id);

        const capabilities = modelManager.getModelCapabilities(firstModel.id);
        expect(capabilities).toHaveProperty('maxTokens');
        expect(capabilities).toHaveProperty('supportsStreaming');
      }
    }, 10000);

    it('should suggest alternatives for unavailable models', async () => {
      if (!runIntegrationTests) return;

      await modelManager.discoverModels();
      const suggestions = modelManager.getSuggestedAlternatives('nonexistent-model');
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('Context Manager', () => {
    it('should gather project context', async () => {
      if (!runIntegrationTests) return;

      const context = await contextManager.gatherProjectContext(process.cwd());
      
      expect(context).toHaveProperty('workspacePath');
      expect(context).toHaveProperty('activeFiles');
      expect(context).toHaveProperty('projectStructure');
      expect(context).toHaveProperty('dependencies');
      
      expect(Array.isArray(context.activeFiles)).toBe(true);
      expect(Array.isArray(context.dependencies)).toBe(true);
    }, 10000);

    it('should build prompt context', async () => {
      if (!runIntegrationTests) return;

      const context = await contextManager.gatherProjectContext(process.cwd());
      const promptContext = contextManager.buildPromptContext('Test request', context);
      
      expect(typeof promptContext).toBe('string');
      expect(promptContext).toContain('# Project Context');
      expect(promptContext).toContain('Test request');
    });
  });

  describe('MCP Server', () => {
    it('should initialize successfully', async () => {
      if (!runIntegrationTests) return;

      await mcpServer.initialize();
      // If we get here without throwing, initialization was successful
      expect(true).toBe(true);
    }, 20000);

    it('should handle model-list tool', async () => {
      if (!runIntegrationTests) return;

      // This would normally be called through the MCP protocol
      // For testing, we'll call the handler directly
      const result = await (mcpServer as any).handleModelList();
      
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('text');
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full analysis workflow', async () => {
      if (!runIntegrationTests) return;

      // Ensure server is initialized
      await mcpServer.initialize();

      // Test code analysis
      const testCode = `
        function fibonacci(n) {
          if (n <= 1) return n;
          return fibonacci(n - 1) + fibonacci(n - 2);
        }
      `;

      const result = await (mcpServer as any).handleCodeAnalyze({
        code: testCode,
        language: 'javascript',
        analysisType: 'performance'
      });

      expect(result).toHaveProperty('content');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.content[0].text.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle model switching', async () => {
      if (!runIntegrationTests) return;

      const models = await modelManager.discoverModels();
      if (models.length < 2) {
        console.log('Need at least 2 models for switching test');
        return;
      }

      const firstModel = models[0];
      const secondModel = models[1];

      // Switch to first model
      const result1 = await (mcpServer as any).handleModelSwitch({
        modelId: firstModel.id
      });
      expect(result1.content[0].text).toContain('Successfully switched');

      // Switch to second model
      const result2 = await (mcpServer as any).handleModelSwitch({
        modelId: secondModel.id
      });
      expect(result2.content[0].text).toContain('Successfully switched');
    }, 15000);
  });
});