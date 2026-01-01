import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { ServerConfig, validateConfig } from './schema.js';
import { getLogger } from '../utils/logger.js';
import { ConfigurationError } from '../utils/errors.js';

// Load environment variables
dotenv.config();

export const loadConfig = async (): Promise<ServerConfig> => {
  try {
    // Try to load from config file first, then environment variables
    const configFromFile = await loadConfigFromFile();
    const configFromEnv = loadConfigFromEnv();
    
    // Merge configs (env variables take precedence)
    const mergedConfig = { ...configFromFile, ...configFromEnv };
    
    const validatedConfig = validateConfig(mergedConfig);
    
    // Log configuration (without sensitive data)
    const logger = getLogger();
    logger.info('Configuration loaded:', {
      endpoint: validatedConfig.lmStudioEndpoint,
      defaultModel: validatedConfig.defaultModel || 'auto-detect',
      maxContextTokens: validatedConfig.maxContextTokens,
      logLevel: validatedConfig.logLevel,
      discoveryEnabled: validatedConfig.discoveryEnabled
    });
    
    return validatedConfig;
  } catch (error) {
    throw new ConfigurationError(
      'Failed to load configuration',
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

const loadConfigFromFile = async (): Promise<Partial<ServerConfig>> => {
  const configPaths = [
    'lm-studio-mcp.config.json',
    '.lm-studio-mcp.json',
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.lm-studio-mcp.json')
  ];

  for (const configPath of configPaths) {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      return config;
    } catch (error) {
      // Continue to next config file
    }
  }

  return {};
};

const loadConfigFromEnv = (): Partial<ServerConfig> => {
  const config: Partial<ServerConfig> = {};

  if (process.env.LM_STUDIO_ENDPOINT) {
    config.lmStudioEndpoint = process.env.LM_STUDIO_ENDPOINT;
  }

  if (process.env.DEFAULT_MODEL) {
    config.defaultModel = process.env.DEFAULT_MODEL;
  }

  if (process.env.MAX_CONTEXT_TOKENS) {
    config.maxContextTokens = parseInt(process.env.MAX_CONTEXT_TOKENS);
  }

  if (process.env.RECONNECT_ATTEMPTS) {
    config.reconnectAttempts = parseInt(process.env.RECONNECT_ATTEMPTS);
  }

  if (process.env.RECONNECT_DELAY) {
    config.reconnectDelay = parseInt(process.env.RECONNECT_DELAY);
  }

  if (process.env.LOG_LEVEL) {
    config.logLevel = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
  }

  if (process.env.DISCOVERY_ENABLED !== undefined) {
    config.discoveryEnabled = process.env.DISCOVERY_ENABLED !== 'false';
  }

  if (process.env.DISCOVERY_INTERVAL) {
    config.discoveryInterval = parseInt(process.env.DISCOVERY_INTERVAL);
  }

  return config;
};

export const saveConfig = async (config: ServerConfig, filePath?: string): Promise<void> => {
  const configPath = filePath || 'lm-studio-mcp.config.json';
  
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    const logger = getLogger();
    logger.info(`Configuration saved to ${configPath}`);
  } catch (error) {
    throw new ConfigurationError(
      `Failed to save configuration to ${configPath}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

export const validateEnvironment = (): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 18) {
    issues.push(`Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`);
  }

  // Check if running in supported environment
  if (process.platform === 'win32' && !process.env.COMSPEC) {
    issues.push('Windows environment not properly configured');
  }

  // Check for required permissions
  try {
    // Test if we can write to current directory
    fs.access('.', fs.constants.W_OK);
  } catch (error) {
    issues.push('No write permissions in current directory');
  }

  return {
    valid: issues.length === 0,
    issues
  };
};

export * from './schema.js';