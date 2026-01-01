import { ModelManager } from '../ModelManager.js';
import { LMStudioClient } from '../LMStudioClient.js';
import { Model } from '../../types/index.js';
import { initializeLogger } from '../../utils/logger.js';
import { loadConfig } from '../../config/index.js';

// Mock LMStudioClient
jest.mock('../LMStudioClient.js');

describe('ModelManager', () => {
  let modelManager: ModelManager;
  let mockLMStudioClient: jest.Mocked<LMStudioClient>;
  
  const mockModels: Model[] = [
    {
      id: 'qwen-4b',
      name: 'Qwen 4B',
      type: 'chat',
      contextWindow: 4096,
      capabilities: ['chat', 'completion'],
      loaded: true
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      type: 'chat',
      contextWindow: 8192,
      capabilities: ['chat', 'completion', 'code'],
      loaded: true
    }
  ];

  beforeEach(() => {
    const config = loadConfig();
    initializeLogger(config);
    
    mockLMStudioClient = new LMStudioClient() as jest.Mocked<LMStudioClient>;
    mockLMStudioClient.isConnected.mockReturnValue(true);
    mockLMStudioClient.listModels.mockResolvedValue(mockModels);
    mockLMStudioClient.loadModel.mockResolvedValue();
    
    modelManager = new ModelManager(mockLMStudioClient, 'qwen-4b');
  });

  describe('discoverModels', () => {
    it('should discover and return available models', async () => {
      const models = await modelManager.discoverModels();
      
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('qwen-4b');
      expect(models[1].id).toBe('deepseek-r1');
      expect(mockLMStudioClient.listModels).toHaveBeenCalled();
    });

    it('should set default model after discovery', async () => {
      await modelManager.discoverModels();
      
      const currentModel = modelManager.getCurrentModel();
      expect(currentModel?.id).toBe('qwen-4b');
      expect(mockLMStudioClient.loadModel).toHaveBeenCalledWith('qwen-4b');
    });

    it('should return empty array when client not connected', async () => {
      mockLMStudioClient.isConnected.mockReturnValue(false);
      
      const models = await modelManager.discoverModels();
      
      expect(models).toHaveLength(0);
      expect(mockLMStudioClient.listModels).not.toHaveBeenCalled();
    });
  });

  describe('selectModel', () => {
    beforeEach(async () => {
      await modelManager.discoverModels();
    });

    it('should select an available model', async () => {
      await modelManager.selectModel('deepseek-r1');
      
      const currentModel = modelManager.getCurrentModel();
      expect(currentModel?.id).toBe('deepseek-r1');
      expect(mockLMStudioClient.loadModel).toHaveBeenCalledWith('deepseek-r1');
    });

    it('should throw error for unavailable model', async () => {
      await expect(modelManager.selectModel('nonexistent-model'))
        .rejects.toThrow('Model nonexistent-model not found');
    });
  });

  describe('getModelCapabilities', () => {
    beforeEach(async () => {
      await modelManager.discoverModels();
    });

    it('should return capabilities for existing model', () => {
      const capabilities = modelManager.getModelCapabilities('deepseek-r1');
      
      expect(capabilities).toEqual({
        maxTokens: 8192,
        supportsStreaming: true,
        supportsSystemPrompts: true,
        supportsFunctionCalling: false
      });
    });

    it('should return null for non-existent model', () => {
      const capabilities = modelManager.getModelCapabilities('nonexistent');
      expect(capabilities).toBeNull();
    });
  });

  describe('getBestModelForTask', () => {
    beforeEach(async () => {
      await modelManager.discoverModels();
    });

    it('should return model with largest context for code-analysis', () => {
      const bestModel = modelManager.getBestModelForTask('code-analysis');
      expect(bestModel?.id).toBe('deepseek-r1'); // Has larger context window
    });

    it('should prefer code-specific models for code-generation', () => {
      const bestModel = modelManager.getBestModelForTask('code-generation');
      expect(bestModel?.id).toBe('deepseek-r1'); // Contains 'deepseek'
    });
  });

  describe('getSuggestedAlternatives', () => {
    beforeEach(async () => {
      await modelManager.discoverModels();
    });

    it('should suggest qwen models for qwen request', () => {
      const suggestions = modelManager.getSuggestedAlternatives('qwen-7b');
      expect(suggestions).toContain('qwen-4b');
    });

    it('should suggest deepseek models for deepseek request', () => {
      const suggestions = modelManager.getSuggestedAlternatives('deepseek-coder');
      expect(suggestions).toContain('deepseek-r1');
    });

    it('should return all models if no specific match', () => {
      const suggestions = modelManager.getSuggestedAlternatives('unknown-model');
      expect(suggestions).toEqual(['qwen-4b', 'deepseek-r1']);
    });
  });
});