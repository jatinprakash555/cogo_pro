import { LMStudioClient } from '../LMStudioClient.js';
import axios from 'axios';
import { initializeLogger } from '../../utils/logger.js';
import { loadConfig } from '../../config/index.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LMStudioClient', () => {
  let client: LMStudioClient;

  beforeEach(() => {
    const config = loadConfig();
    initializeLogger(config);
    client = new LMStudioClient();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock axios.create
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
  });

  describe('connect', () => {
    it('should connect successfully when LM Studio is available', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get.mockResolvedValue({ data: { data: [] } });

      await client.connect('http://localhost:1234');

      expect(client.isConnected()).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/models');
    });

    it('should throw error when connection fails', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      await expect(client.connect('http://localhost:1234')).rejects.toThrow('Connection refused');
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('discoverEndpoint', () => {
    it('should discover endpoint when LM Studio is running', async () => {
      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue({ data: { data: [] } }),
      };
      mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

      const endpoint = await client.discoverEndpoint();

      expect(endpoint).toBe('http://localhost:1234');
    });

    it('should return null when no endpoint is found', async () => {
      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(new Error('Connection refused')),
      };
      mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

      const endpoint = await client.discoverEndpoint();

      expect(endpoint).toBeNull();
    });
  });

  describe('listModels', () => {
    it('should list available models', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: { data: [] } }) // connect call
        .mockResolvedValueOnce({
          data: {
            data: [
              { id: 'qwen-4b', context_length: 4096 },
              { id: 'deepseek-r1', context_length: 8192 }
            ]
          }
        });

      await client.connect('http://localhost:1234');
      const models = await client.listModels();

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('qwen-4b');
      expect(models[0].contextWindow).toBe(4096);
      expect(models[1].id).toBe('deepseek-r1');
      expect(models[1].contextWindow).toBe(8192);
    });
  });

  describe('sendRequest', () => {
    it('should send request and return response', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get.mockResolvedValue({ data: { data: [] } });
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Test response', role: 'assistant' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'test-model'
        }
      });

      await client.connect('http://localhost:1234');
      const response = await client.sendRequest('Test prompt');

      expect(response.choices[0].message.content).toBe('Test response');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/chat/completions', expect.objectContaining({
        messages: [{ role: 'user', content: 'Test prompt' }]
      }));
    });
  });
});