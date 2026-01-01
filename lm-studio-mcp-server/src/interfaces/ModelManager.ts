import { Model, ModelCapabilities } from '../types/index.js';

export interface ModelManager {
  discoverModels(): Promise<Model[]>;
  selectModel(modelId: string): Promise<void>;
  getCurrentModel(): Model | null;
  getModelCapabilities(modelId: string): ModelCapabilities | null;
  getAvailableModels(): Model[];
  isModelLoaded(modelId: string): boolean;
}