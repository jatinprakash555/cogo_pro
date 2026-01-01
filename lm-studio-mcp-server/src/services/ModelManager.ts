import { ModelManager as IModelManager } from '../interfaces/ModelManager.js';
import { LMStudioClient } from './LMStudioClient.js';
import { Model, ModelCapabilities } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { ModelError, ConnectionError } from '../utils/errors.js';
import { withRetry } from '../utils/retry.js';

export class ModelManager implements IModelManager {
  private models: Model[] = [];
  private currentModel: Model | null = null;
  private readonly logger = getLogger();
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(
    private lmStudioClient: LMStudioClient,
    private defaultModelId?: string,
    private autoDiscoveryInterval: number = 30000
  ) {}

  async discoverModels(): Promise<Model[]> {
    try {
      if (!this.lmStudioClient.isConnected()) {
        this.logger.warn('LM Studio client not connected, cannot discover models');
        return [];
      }

      const discoveredModels = await this.lmStudioClient.listModels();
      this.models = discoveredModels;
      
      this.logger.info(`Discovered ${this.models.length} models:`, 
        this.models.map(m => m.id).join(', '));

      // Set default model if not already set
      if (!this.currentModel && this.models.length > 0) {
        const defaultModel = this.defaultModelId 
          ? this.models.find(m => m.id === this.defaultModelId)
          : this.models[0];
        
        if (defaultModel) {
          await this.selectModel(defaultModel.id);
        }
      }

      return this.models;
    } catch (error) {
      this.logger.error('Failed to discover models:', error);
      return [];
    }
  }

  async selectModel(modelId: string): Promise<void> {
    const model = this.models.find(m => m.id === modelId);
    
    if (!model) {
      const availableModels = this.models.map(m => m.id).join(', ');
      const suggestions = this.getSuggestedAlternatives(modelId);
      throw new ModelError(
        `Model ${modelId} not found. Available models: ${availableModels}. Suggestions: ${suggestions.join(', ')}`
      );
    }

    try {
      await withRetry(async () => {
        await this.lmStudioClient.loadModel(modelId);
      }, { maxAttempts: 2, baseDelay: 1000 });
      
      this.currentModel = model;
      this.logger.info(`Successfully selected model: ${modelId}`);
    } catch (error) {
      const modelError = new ModelError(
        `Failed to select model ${modelId}`,
        error instanceof Error ? error : new Error(String(error))
      );
      this.logger.error('Model selection failed:', modelError);
      throw modelError;
    }
  }

  getCurrentModel(): Model | null {
    return this.currentModel;
  }

  getModelCapabilities(modelId: string): ModelCapabilities | null {
    const model = this.models.find(m => m.id === modelId);
    
    if (!model) {
      return null;
    }

    // Return capabilities based on model type and known characteristics
    return {
      maxTokens: model.contextWindow,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsFunctionCalling: this.supportsFunctionCalling(modelId),
    };
  }

  getAvailableModels(): Model[] {
    return [...this.models];
  }

  isModelLoaded(modelId: string): boolean {
    return this.currentModel?.id === modelId;
  }

  startAutoDiscovery(): void {
    if (this.discoveryInterval) {
      return; // Already running
    }

    this.logger.info(`Starting auto-discovery with ${this.autoDiscoveryInterval}ms interval`);
    
    this.discoveryInterval = setInterval(async () => {
      try {
        await this.discoverModels();
      } catch (error) {
        this.logger.error('Auto-discovery failed:', error);
      }
    }, this.autoDiscoveryInterval);
  }

  stopAutoDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
      this.logger.info('Stopped auto-discovery');
    }
  }

  getBestModelForTask(task: 'code-analysis' | 'code-generation' | 'explanation' | 'general'): Model | null {
    if (this.models.length === 0) {
      return null;
    }

    // Simple heuristics for model selection based on task
    switch (task) {
      case 'code-analysis':
        // Prefer models with larger context windows for code analysis
        return this.models.reduce((best, current) => 
          current.contextWindow > best.contextWindow ? current : best
        );
      
      case 'code-generation':
        // Look for models that are good at code generation (DeepSeek, Qwen, etc.)
        const codeModels = this.models.filter(m => 
          m.id.toLowerCase().includes('deepseek') || 
          m.id.toLowerCase().includes('qwen') ||
          m.id.toLowerCase().includes('code')
        );
        return codeModels.length > 0 ? codeModels[0] : this.models[0];
      
      case 'explanation':
        // Prefer models that are good at explanations
        return this.currentModel || this.models[0];
      
      default:
        return this.currentModel || this.models[0];
    }
  }

  getModelStats(): { totalModels: number; currentModel: string | null; availableModels: string[] } {
    return {
      totalModels: this.models.length,
      currentModel: this.currentModel?.id || null,
      availableModels: this.models.map(m => m.id),
    };
  }

  private supportsFunctionCalling(modelId: string): boolean {
    // Check if model supports function calling based on known model capabilities
    const functionCallingModels = [
      'gpt-3.5-turbo',
      'gpt-4',
      'claude-3',
      // Add more models that support function calling
    ];
    
    return functionCallingModels.some(pattern => 
      modelId.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  async validateModelAvailability(modelId: string): Promise<boolean> {
    try {
      await this.discoverModels();
      return this.models.some(m => m.id === modelId);
    } catch (error) {
      this.logger.error(`Failed to validate model ${modelId}:`, error);
      return false;
    }
  }

  getSuggestedAlternatives(unavailableModelId: string): string[] {
    // Suggest similar models if the requested one is unavailable
    const suggestions: string[] = [];
    
    if (unavailableModelId.toLowerCase().includes('qwen')) {
      suggestions.push(...this.models.filter(m => m.id.toLowerCase().includes('qwen')).map(m => m.id));
    }
    
    if (unavailableModelId.toLowerCase().includes('deepseek')) {
      suggestions.push(...this.models.filter(m => m.id.toLowerCase().includes('deepseek')).map(m => m.id));
    }
    
    // If no specific suggestions, return all available models
    if (suggestions.length === 0) {
      suggestions.push(...this.models.map(m => m.id));
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
}