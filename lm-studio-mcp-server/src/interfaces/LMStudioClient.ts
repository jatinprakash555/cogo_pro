import { Model, RequestOptions, LMStudioResponse, ConnectionStatus } from '../types/index.js';

export interface LMStudioClient {
  connect(endpoint: string): Promise<void>;
  sendRequest(prompt: string, options: RequestOptions): Promise<LMStudioResponse>;
  listModels(): Promise<Model[]>;
  loadModel(modelId: string): Promise<void>;
  isConnected(): boolean;
  getConnectionStatus(): ConnectionStatus;
  disconnect(): Promise<void>;
  discoverEndpoint(): Promise<string | null>;
}