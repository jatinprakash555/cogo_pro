#!/usr/bin/env node

import { MCPServer } from './server/MCPServer.js';
import { LMStudioClient } from './services/LMStudioClient.js';
import { ModelManager } from './services/ModelManager.js';
import { ContextManager } from './services/ContextManager.js';
import { EndpointDiscovery } from './services/EndpointDiscovery.js';
import { loadConfig, validateEnvironment } from './config/index.js';
import { initializeLogger, getLogger } from './utils/logger.js';
import { ConfigurationError } from './utils/errors.js';

async function main() {
  try {
    // Validate environment first
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      console.error('Environment validation failed:');
      envValidation.issues.forEach(issue => console.error(`  - ${issue}`));
      process.exit(1);
    }

    // Load configuration
    const config = await loadConfig();
    
    // Initialize logging
    const logger = initializeLogger(config);
    
    logger.info('Starting LM Studio MCP Server...');
    logger.info('Configuration loaded successfully');

    // Initialize services
    const lmStudioClient = new LMStudioClient();
    const modelManager = new ModelManager(lmStudioClient, config.defaultModel);
    const contextManager = new ContextManager();
    
    // Auto-discover endpoint if needed
    if (config.discoveryEnabled && (!config.lmStudioEndpoint || config.lmStudioEndpoint === 'http://localhost:1234')) {
      logger.info('Auto-discovery enabled, searching for LM Studio...');
      const discovery = new EndpointDiscovery();
      const bestEndpoint = await discovery.findBestEndpoint();
      
      if (bestEndpoint) {
        config.lmStudioEndpoint = bestEndpoint;
        logger.info(`Auto-discovered LM Studio at: ${bestEndpoint}`);
      } else {
        logger.warn('No LM Studio endpoint discovered, using configured endpoint');
      }
    }

    // Create and initialize MCP server
    const mcpServer = new MCPServer(config, lmStudioClient, modelManager, contextManager);
    
    // Set up graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await mcpServer.shutdown();
        logger.info('Server shut down successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    // Start the server
    await mcpServer.run();
    
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('Configuration error:', error.message);
      if (error.originalError) {
        console.error('Details:', error.originalError.message);
      }
    } else {
      console.error('Failed to start server:', error);
    }
    process.exit(1);
  }
}

// Handle CLI arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
LM Studio MCP Server

Usage: lm-studio-mcp-server [options]

Options:
  -h, --help     Show this help message
  --version      Show version information
  --config       Show current configuration
  --test         Test connection to LM Studio
  --discover     Discover available LM Studio endpoints
  --setup-kiro   Setup Kiro MCP integration automatically

Environment Variables:
  LM_STUDIO_ENDPOINT    LM Studio endpoint URL (default: auto-discover)
  DEFAULT_MODEL         Default model to use (default: auto-select)
  MAX_CONTEXT_TOKENS    Maximum context tokens (default: 4096)
  LOG_LEVEL            Log level: debug, info, warn, error (default: info)
  DISCOVERY_ENABLED    Enable endpoint discovery (default: true)

Configuration Files:
  - lm-studio-mcp.config.json (current directory)
  - .lm-studio-mcp.json (current directory)
  - ~/.lm-studio-mcp.json (home directory)

Examples:
  lm-studio-mcp-server
  LM_STUDIO_ENDPOINT=http://192.168.1.100:1234 lm-studio-mcp-server
  LOG_LEVEL=debug lm-studio-mcp-server
`);
  process.exit(0);
}

if (process.argv.includes('--version')) {
  const packageJson = await import('../package.json', { assert: { type: 'json' } });
  console.log(packageJson.default.version);
  process.exit(0);
}

if (process.argv.includes('--config')) {
  try {
    const config = await loadConfig();
    console.log('Current configuration:');
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to load configuration:', error);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes('--test')) {
  try {
    const config = await loadConfig();
    initializeLogger(config);
    
    const client = new LMStudioClient();
    const discovery = new EndpointDiscovery();
    
    console.log('Testing LM Studio connection...');
    
    let endpoint = config.lmStudioEndpoint;
    if (!endpoint || endpoint === 'http://localhost:1234') {
      console.log('Discovering endpoints...');
      endpoint = await discovery.findBestEndpoint();
      if (!endpoint) {
        console.error('No LM Studio endpoints found');
        process.exit(1);
      }
    }
    
    await client.connect(endpoint);
    const models = await client.listModels();
    
    console.log(`✓ Connected to LM Studio at ${endpoint}`);
    console.log(`✓ Found ${models.length} models:`);
    models.forEach(model => {
      console.log(`  - ${model.id} (${model.contextWindow} tokens)`);
    });
    
    await client.disconnect();
    console.log('✓ Connection test successful');
  } catch (error) {
    console.error('Connection test failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes('--discover')) {
  try {
    const discovery = new EndpointDiscovery();
    console.log('Discovering LM Studio endpoints...');
    
    const endpoints = await discovery.discoverLMStudioEndpoints();
    
    if (endpoints.length === 0) {
      console.log('No LM Studio endpoints found');
    } else {
      console.log(`Found ${endpoints.length} LM Studio endpoint(s):`);
      endpoints.forEach((endpoint, index) => {
        console.log(`${index + 1}. ${endpoint.endpoint}`);
        console.log(`   Response time: ${endpoint.responseTime}ms`);
        console.log(`   Models: ${endpoint.models.length} (${endpoint.models.slice(0, 3).join(', ')}${endpoint.models.length > 3 ? '...' : ''})`);
        console.log();
      });
    }
  } catch (error) {
    console.error('Discovery failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes('--setup-kiro')) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    console.log('Setting up Kiro MCP integration...');
    
    // Create .kiro/settings directory if it doesn't exist
    const kiroSettingsDir = '.kiro/settings';
    await fs.mkdir(kiroSettingsDir, { recursive: true });
    
    // Auto-discover endpoint
    const discovery = new EndpointDiscovery();
    const bestEndpoint = await discovery.findBestEndpoint();
    const endpoint = bestEndpoint || 'http://localhost:1234';
    
    // Create MCP configuration
    const mcpConfig = {
      mcpServers: {
        'lm-studio': {
          command: 'lm-studio-mcp-server',
          args: [],
          env: {
            LM_STUDIO_ENDPOINT: endpoint,
            LOG_LEVEL: 'info',
            DISCOVERY_ENABLED: 'true',
            MAX_CONTEXT_TOKENS: '4096'
          },
          disabled: false,
          autoApprove: [
            'model-list',
            'context-refresh'
          ]
        }
      }
    };
    
    const mcpConfigPath = path.join(kiroSettingsDir, 'mcp.json');
    
    // Check if config already exists
    let existingConfig = {};
    try {
      const existingContent = await fs.readFile(mcpConfigPath, 'utf-8');
      existingConfig = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist, that's fine
    }
    
    // Merge configurations
    const mergedConfig = {
      ...existingConfig,
      mcpServers: {
        ...existingConfig.mcpServers || {},
        ...mcpConfig.mcpServers
      }
    };
    
    await fs.writeFile(mcpConfigPath, JSON.stringify(mergedConfig, null, 2));
    
    console.log('✓ Kiro MCP configuration created/updated');
    console.log(`✓ LM Studio endpoint: ${endpoint}`);
    console.log(`✓ Configuration saved to: ${mcpConfigPath}`);
    console.log('\nNext steps:');
    console.log('1. Restart Kiro to load the new MCP server');
    console.log('2. The LM Studio MCP server will be available in Kiro\'s MCP tools');
    console.log('3. Use tools like code-analyze, code-generate, model-list, etc.');
    
  } catch (error) {
    console.error('Failed to setup Kiro integration:', error);
    process.exit(1);
  }
  process.exit(0);
}

// Start the server
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});