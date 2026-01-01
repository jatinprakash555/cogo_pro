import { validateConfig, ServerConfigSchema } from '../schema.js';
import { validateEnvironment } from '../index.js';

describe('Configuration', () => {
  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const config = {
        lmStudioEndpoint: 'http://localhost:1234',
        defaultModel: 'qwen-4b',
        maxContextTokens: 4096,
        reconnectAttempts: 5,
        reconnectDelay: 1000,
        logLevel: 'info' as const,
        discoveryEnabled: true,
        discoveryInterval: 30000
      };

      const result = validateConfig(config);
      expect(result).toEqual(config);
    });

    it('should apply defaults for missing values', () => {
      const config = {
        lmStudioEndpoint: 'http://localhost:1234'
      };

      const result = validateConfig(config);
      expect(result.defaultModel).toBe('');
      expect(result.maxContextTokens).toBe(4096);
      expect(result.logLevel).toBe('info');
      expect(result.discoveryEnabled).toBe(true);
    });

    it('should throw error for invalid endpoint URL', () => {
      const config = {
        lmStudioEndpoint: 'not-a-url'
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it('should throw error for invalid log level', () => {
      const config = {
        lmStudioEndpoint: 'http://localhost:1234',
        logLevel: 'invalid' as any
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it('should throw error for negative values', () => {
      const config = {
        lmStudioEndpoint: 'http://localhost:1234',
        maxContextTokens: -1
      };

      expect(() => validateConfig(config)).toThrow();
    });
  });

  describe('validateEnvironment', () => {
    it('should validate current environment', () => {
      const result = validateEnvironment();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });
});