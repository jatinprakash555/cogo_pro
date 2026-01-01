import axios, { AxiosInstance } from 'axios';
import { LMStudioClient as ILMStudioClient } from '../interfaces/LMStudioClient.js';
import { Model, RequestOptions, LMStudioResponse, ConnectionStatus } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { ConnectionError, ModelError } from '../utils/errors.js';
import { withRetry, CircuitBreaker } from '../utils/retry.js';

export class LMStudioClient implements ILMStudioClient {
  private client: AxiosInstance | null = null;
  private endpoint: string = '';
  private connectionStatus: ConnectionStatus = {
    connected: false,
    reconnectAttempts: 0
  };
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly logger = getLogger();
  private readonly circuitBreaker = new CircuitBreaker(5, 60000);

  async connect(endpoint: string): Promise<void> {
    this.endpoint = endpoint;
    this.client = axios.create({
      baseURL: endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    try {
      // Test connection by listing models with retry logic
      await withRetry(async () => {
        if (!this.client) throw new ConnectionError('Client not initialized');
        await this.client.get('/v1/models');
      }, { maxAttempts: 3, baseDelay: 1000 });

      this.connectionStatus = {
        connected: true,
        lastConnected: new Date(),
        reconnectAttempts: 0
      };
      this.logger.info(`Connected to LM Studio at ${endpoint}`);
    } catch (error) {
      const connectionError = new ConnectionError(
        `Failed to connect to LM Studio at ${endpoint}`,
        error instanceof Error ? error : new Error(String(error))
      );
      
      this.connectionStatus = {
        connected: false,
        lastError: connectionError.message,
        reconnectAttempts: 0
      };
      
      this.logger.error('Connection failed:', connectionError);
      throw connectionError;
    }
  }

  async discoverEndpoint(): Promise<string | null> {
    const commonPorts = [1234, 8080, 3000, 5000];
    const commonHosts = ['localhost', '127.0.0.1', '10.171.217.128'];
    
    this.logger.info('Starting LM Studio endpoint discovery...');
    
    for (const host of commonHosts) {
      for (const port of commonPorts) {
        const endpoint = `http://${host}:${port}`;
        try {
          const testClient = axios.create({
            baseURL: endpoint,
            timeout: 5000,
          });
          
          await testClient.get('/v1/models');
          this.logger.info(`Discovered LM Studio at ${endpoint}`);
          return endpoint;
        } catch (error) {
          // Continue searching
        }
      }
    }
    
    this.logger.warn('Could not discover LM Studio endpoint');
    return null;
  }

  async sendRequest(prompt: string, options: RequestOptions = {}): Promise<LMStudioResponse> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new ConnectionError('Not connected to LM Studio');
    }

    const requestBody = {
      model: options.model || 'local-model',
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      stream: options.stream || false,
    };

    try {
      return await this.circuitBreaker.execute(async () => {
        if (!this.client) throw new ConnectionError('Client not initialized');
        
        const response = await this.client.post('/v1/chat/completions', requestBody);
        return response.data as LMStudioResponse;
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 503) {
          this.connectionStatus.connected = false;
          this.connectionStatus.lastError = 'Connection lost';
          this.logger.warn('Connection to LM Studio lost, attempting reconnection...');
          await this.attemptReconnect();
          throw new ConnectionError('Connection lost to LM Studio', error);
        }
        
        if (error.response?.status === 400) {
          throw new ModelError('Invalid request to LM Studio', error);
        }
      }
      
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async listModels(): Promise<Model[]> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new ConnectionError('Not connected to LM Studio');
    }

    try {
      return await withRetry(async () => {
        if (!this.client) throw new ConnectionError('Client not initialized');
        
        const response = await this.client.get('/v1/models');
        const models = response.data.data || [];
        
        return models.map((model: any) => ({
          id: model.id,
          name: model.id,
          type: 'chat',
          contextWindow: model.context_length || 4096,
          capabilities: ['chat', 'completion'],
          loaded: true
        }));
      }, { maxAttempts: 2, baseDelay: 500 });
    } catch (error) {
      const modelError = new ModelError('Failed to list models', error instanceof Error ? error : new Error(String(error)));
      this.logger.error('Model listing failed:', modelError);
      throw modelError;
    }
  }

  async loadModel(modelId: string): Promise<void> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new ConnectionError('Not connected to LM Studio');
    }

    try {
      // LM Studio typically loads models automatically when requested
      // We'll verify the model exists by listing models
      const models = await this.listModels();
      const model = models.find(m => m.id === modelId);
      
      if (!model) {
        throw new ModelError(`Model ${modelId} not found in available models: ${models.map(m => m.id).join(', ')}`);
      }
      
      this.logger.info(`Model ${modelId} is available and ready`);
    } catch (error) {
      if (error instanceof ModelError || error instanceof ConnectionError) {
        throw error;
      }
      
      const modelError = new ModelError(`Failed to load model ${modelId}`, error instanceof Error ? error : new Error(String(error)));
      this.logger.error('Model loading failed:', modelError);
      throw modelError;
    }
  }

  isConnected(): boolean {
    return this.connectionStatus.connected;
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.connectionStatus.connected = false;
    this.client = null;
    this.logger.info('Disconnected from LM Studio');
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      return; // Already attempting reconnection
    }

    const maxAttempts = 5;
    const baseDelay = 1000;

    const reconnect = async (attempt: number): Promise<void> => {
      if (attempt > maxAttempts) {
        this.logger.error('Max reconnection attempts reached');
        return;
      }

      try {
        // Try to discover new endpoint first
        let endpoint = this.endpoint;
        if (!endpoint) {
          const discovered = await this.discoverEndpoint();
          if (discovered) {
            endpoint = discovered;
          }
        }

        if (endpoint) {
          await this.connect(endpoint);
          this.logger.info('Reconnected to LM Studio');
          return;
        }
      } catch (error) {
        this.connectionStatus.reconnectAttempts = attempt;
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        
        this.logger.warn(`Reconnection attempt ${attempt} failed, retrying in ${delay}ms`);
        
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          reconnect(attempt + 1);
        }, delay);
      }
    };

    await reconnect(1);
  }
}