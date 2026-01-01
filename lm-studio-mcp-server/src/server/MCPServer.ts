import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServer as IMCPServer } from '../interfaces/MCPServer.js';
import { LMStudioClient } from '../services/LMStudioClient.js';
import { ModelManager } from '../services/ModelManager.js';
import { ContextManager } from '../services/ContextManager.js';
import { ServerConfig } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { 
  LMStudioError, 
  ConnectionError, 
  ModelError, 
  ContextError, 
  ValidationError,
  getErrorRecoveryMessage 
} from '../utils/errors.js';

export class MCPServer implements IMCPServer {
  private server: Server;
  private readonly logger = getLogger();
  private isInitialized = false;

  constructor(
    private config: ServerConfig,
    private lmStudioClient: LMStudioClient,
    private modelManager: ModelManager,
    private contextManager: ContextManager
  ) {
    this.server = new Server(
      {
        name: 'lm-studio-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing MCP Server...');

      // Connect to LM Studio
      await this.connectToLMStudio();

      // Discover models
      await this.modelManager.discoverModels();

      // Register tools
      this.registerTools();

      // Set up request handlers
      this.setupRequestHandlers();

      // Gather initial project context
      await this.gatherInitialContext();

      this.isInitialized = true;
      this.logger.info('MCP Server initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize MCP Server:', error);
      throw error;
    }
  }

  registerTools(): void {
    const tools: Tool[] = [
      {
        name: 'code-analyze',
        description: 'Analyze code for quality, security, performance, or general issues',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The code to analyze'
            },
            language: {
              type: 'string',
              description: 'Programming language of the code'
            },
            analysisType: {
              type: 'string',
              enum: ['quality', 'security', 'performance', 'all'],
              description: 'Type of analysis to perform',
              default: 'all'
            },
            modelId: {
              type: 'string',
              description: 'Specific model to use for analysis (optional)'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'code-generate',
        description: 'Generate code based on specifications and requirements',
        inputSchema: {
          type: 'object',
          properties: {
            specification: {
              type: 'string',
              description: 'Detailed specification of what code to generate'
            },
            language: {
              type: 'string',
              description: 'Target programming language'
            },
            includeContext: {
              type: 'boolean',
              description: 'Whether to include project context',
              default: true
            },
            modelId: {
              type: 'string',
              description: 'Specific model to use for generation (optional)'
            }
          },
          required: ['specification', 'language']
        }
      },
      {
        name: 'code-explain',
        description: 'Explain complex code sections in detail',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The code to explain'
            },
            language: {
              type: 'string',
              description: 'Programming language of the code'
            },
            focusArea: {
              type: 'string',
              description: 'Specific aspect to focus on (optional)'
            },
            modelId: {
              type: 'string',
              description: 'Specific model to use for explanation (optional)'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'code-refactor',
        description: 'Suggest refactoring improvements for code',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The code to refactor'
            },
            language: {
              type: 'string',
              description: 'Programming language of the code'
            },
            goals: {
              type: 'array',
              items: { type: 'string' },
              description: 'Refactoring goals (e.g., performance, readability, maintainability)'
            },
            modelId: {
              type: 'string',
              description: 'Specific model to use for refactoring (optional)'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'model-list',
        description: 'List all available models and their capabilities',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'model-switch',
        description: 'Switch to a different model for subsequent requests',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description: 'ID of the model to switch to'
            }
          },
          required: ['modelId']
        }
      },
      {
        name: 'context-refresh',
        description: 'Refresh the project context with latest changes',
        inputSchema: {
          type: 'object',
          properties: {
            workspacePath: {
              type: 'string',
              description: 'Path to workspace (optional, uses current if not provided)'
            }
          }
        }
      }
    ];

    // Register each tool
    for (const tool of tools) {
      this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools
      }));
    }

    this.logger.info(`Registered ${tools.length} MCP tools`);
  }

  async handleRequest(request: any): Promise<any> {
    // This method is part of the interface but actual request handling
    // is done through the MCP SDK's request handlers
    throw new Error('Use MCP SDK request handlers instead');
  }

  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down MCP Server...');
      
      // Stop model discovery
      this.modelManager.stopAutoDiscovery();
      
      // Disconnect from LM Studio
      await this.lmStudioClient.disconnect();
      
      this.isInitialized = false;
      this.logger.info('MCP Server shut down successfully');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  async run(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logger.info('MCP Server is running and ready to accept requests');
  }

  private async connectToLMStudio(): Promise<void> {
    let endpoint = this.config.lmStudioEndpoint;

    // Try to discover endpoint if default doesn't work
    if (!endpoint || endpoint === 'http://localhost:1234') {
      try {
        await this.lmStudioClient.connect(endpoint);
      } catch (error) {
        this.logger.warn('Default endpoint failed, attempting discovery...');
        const discovered = await this.lmStudioClient.discoverEndpoint();
        if (discovered) {
          endpoint = discovered;
        } else {
          throw new Error('Could not connect to or discover LM Studio endpoint');
        }
      }
    }

    if (!this.lmStudioClient.isConnected()) {
      await this.lmStudioClient.connect(endpoint);
    }

    this.logger.info(`Connected to LM Studio at ${endpoint}`);
  }

  private setupRequestHandlers(): void {
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.logger.info(`Executing tool: ${name}`, { tool: name, args });
        
        // Validate tool exists
        const validTools = ['code-analyze', 'code-generate', 'code-explain', 'code-refactor', 'model-list', 'model-switch', 'context-refresh'];
        if (!validTools.includes(name)) {
          throw new ValidationError(`Unknown tool: ${name}. Available tools: ${validTools.join(', ')}`);
        }
        
        switch (name) {
          case 'code-analyze':
            return await this.handleCodeAnalyze(args);
          case 'code-generate':
            return await this.handleCodeGenerate(args);
          case 'code-explain':
            return await this.handleCodeExplain(args);
          case 'code-refactor':
            return await this.handleCodeRefactor(args);
          case 'model-list':
            return await this.handleModelList();
          case 'model-switch':
            return await this.handleModelSwitch(args);
          case 'context-refresh':
            return await this.handleContextRefresh(args);
          default:
            throw new ValidationError(`Unhandled tool: ${name}`);
        }
      } catch (error) {
        return this.handleToolError(name, error);
      }
    });
  }

  private async handleCodeAnalyze(args: any) {
    // Validate required parameters
    if (!args.code || typeof args.code !== 'string') {
      throw new ValidationError('Code parameter is required and must be a string');
    }
    if (!args.language || typeof args.language !== 'string') {
      throw new ValidationError('Language parameter is required and must be a string');
    }

    const { code, language, analysisType = 'all', modelId } = args;
    
    // Validate analysis type
    const validTypes = ['quality', 'security', 'performance', 'all'];
    if (!validTypes.includes(analysisType)) {
      throw new ValidationError(`Invalid analysis type: ${analysisType}. Valid types: ${validTypes.join(', ')}`);
    }
    
    if (modelId) {
      await this.modelManager.selectModel(modelId);
    }

    const prompt = this.buildAnalysisPrompt(code, language, analysisType);
    const response = await this.lmStudioClient.sendRequest(prompt);
    
    return {
      content: [
        {
          type: 'text',
          text: response.choices[0]?.message?.content || 'No analysis generated'
        }
      ]
    };
  }

  private async handleCodeGenerate(args: any) {
    const { specification, language, includeContext = true, modelId } = args;
    
    if (modelId) {
      await this.modelManager.selectModel(modelId);
    }

    let prompt = `Generate ${language} code based on the following specification:\n\n${specification}`;
    
    if (includeContext) {
      const context = this.contextManager.getCurrentContext();
      if (context) {
        prompt = this.contextManager.buildPromptContext(prompt, context);
      }
    }

    const response = await this.lmStudioClient.sendRequest(prompt);
    
    return {
      content: [
        {
          type: 'text',
          text: response.choices[0]?.message?.content || 'No code generated'
        }
      ]
    };
  }

  private async handleCodeExplain(args: any) {
    const { code, language, focusArea, modelId } = args;
    
    if (modelId) {
      await this.modelManager.selectModel(modelId);
    }

    let prompt = `Explain the following ${language} code in detail`;
    if (focusArea) {
      prompt += `, focusing on ${focusArea}`;
    }
    prompt += `:\n\n\`\`\`${language}\n${code}\n\`\`\``;

    const response = await this.lmStudioClient.sendRequest(prompt);
    
    return {
      content: [
        {
          type: 'text',
          text: response.choices[0]?.message?.content || 'No explanation generated'
        }
      ]
    };
  }

  private async handleCodeRefactor(args: any) {
    const { code, language, goals = [], modelId } = args;
    
    if (modelId) {
      await this.modelManager.selectModel(modelId);
    }

    let prompt = `Suggest refactoring improvements for the following ${language} code`;
    if (goals.length > 0) {
      prompt += ` with focus on: ${goals.join(', ')}`;
    }
    prompt += `:\n\n\`\`\`${language}\n${code}\n\`\`\``;

    const response = await this.lmStudioClient.sendRequest(prompt);
    
    return {
      content: [
        {
          type: 'text',
          text: response.choices[0]?.message?.content || 'No refactoring suggestions generated'
        }
      ]
    };
  }

  private async handleModelList() {
    const models = this.modelManager.getAvailableModels();
    const currentModel = this.modelManager.getCurrentModel();
    
    const modelInfo = models.map(model => {
      const capabilities = this.modelManager.getModelCapabilities(model.id);
      return {
        id: model.id,
        name: model.name,
        type: model.type,
        contextWindow: model.contextWindow,
        capabilities: capabilities,
        current: model.id === currentModel?.id
      };
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(modelInfo, null, 2)
        }
      ]
    };
  }

  private async handleModelSwitch(args: any) {
    const { modelId } = args;
    
    try {
      await this.modelManager.selectModel(modelId);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully switched to model: ${modelId}`
          }
        ]
      };
    } catch (error) {
      const suggestions = this.modelManager.getSuggestedAlternatives(modelId);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to switch to model ${modelId}. Available alternatives: ${suggestions.join(', ')}`
          }
        ]
      };
    }
  }

  private async handleContextRefresh(args: any) {
    const workspacePath = args.workspacePath || process.cwd();
    
    try {
      await this.contextManager.gatherProjectContext(workspacePath);
      return {
        content: [
          {
            type: 'text',
            text: `Project context refreshed for: ${workspacePath}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to refresh context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private buildAnalysisPrompt(code: string, language: string, analysisType: string): string {
    let prompt = `Analyze the following ${language} code`;
    
    switch (analysisType) {
      case 'quality':
        prompt += ' for code quality issues, including readability, maintainability, and best practices';
        break;
      case 'security':
        prompt += ' for security vulnerabilities and potential security issues';
        break;
      case 'performance':
        prompt += ' for performance issues and optimization opportunities';
        break;
      case 'all':
        prompt += ' for quality, security, performance, and general issues';
        break;
    }
    
    prompt += `:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide specific recommendations and explanations.`;
    
    return prompt;
  }

  private async gatherInitialContext(): Promise<void> {
    try {
      const workspacePath = process.cwd();
      await this.contextManager.gatherProjectContext(workspacePath);
      this.logger.info('Initial project context gathered');
    } catch (error) {
      this.logger.warn('Failed to gather initial context:', error);
    }
  }
}
  privat
e handleToolError(toolName: string, error: unknown): any {
    const err = error instanceof Error ? error : new Error(String(error));
    
    this.logger.error(`Tool execution failed for ${toolName}:`, {
      error: err.message,
      stack: err.stack,
      tool: toolName
    });

    let errorMessage = err.message;
    let recoveryMessage = '';

    if (err instanceof LMStudioError) {
      recoveryMessage = getErrorRecoveryMessage(err);
      errorMessage = `${err.message}\n\nRecovery suggestion: ${recoveryMessage}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${toolName}: ${errorMessage}`
        }
      ],
      isError: true
    };
  }

  private validateStringParameter(value: any, paramName: string): string {
    if (!value || typeof value !== 'string') {
      throw new ValidationError(`${paramName} parameter is required and must be a string`);
    }
    return value;
  }

  private validateOptionalStringParameter(value: any, paramName: string): string | undefined {
    if (value !== undefined && typeof value !== 'string') {
      throw new ValidationError(`${paramName} parameter must be a string if provided`);
    }
    return value;
  }