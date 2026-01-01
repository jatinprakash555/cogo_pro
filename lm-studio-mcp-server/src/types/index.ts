// Core interfaces for the LM Studio MCP Server

export interface ServerConfig {
  lmStudioEndpoint: string;
  defaultModel: string;
  maxContextTokens: number;
  reconnectAttempts: number;
  reconnectDelay: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  discoveryEnabled: boolean;
  discoveryInterval: number;
}

export interface Model {
  id: string;
  name: string;
  type: string;
  contextWindow: number;
  capabilities: string[];
  loaded: boolean;
}

export interface ModelCapabilities {
  maxTokens: number;
  supportsStreaming: boolean;
  supportsSystemPrompts: boolean;
  supportsFunctionCalling: boolean;
}

export interface RequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export interface ProjectContext {
  workspacePath: string;
  activeFiles: FileContext[];
  projectStructure: DirectoryTree;
  dependencies: Dependency[];
  gitContext?: GitContext;
}

export interface FileContext {
  path: string;
  content: string;
  language: string;
  relevanceScore: number;
  lastModified: Date;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
}

export interface Dependency {
  name: string;
  version: string;
  type: 'dev' | 'prod';
}

export interface GitContext {
  branch: string;
  lastCommit: string;
  uncommittedChanges: boolean;
}

export interface CodeAnalysisRequest {
  code: string;
  language: string;
  analysisType: 'quality' | 'security' | 'performance' | 'all';
  modelId?: string;
}

export interface CodeGenerationRequest {
  specification: string;
  language: string;
  context?: ProjectContext;
  modelId?: string;
}

export interface MCPToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  modelUsed: string;
}

export interface LMStudioResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export interface ConnectionStatus {
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
  reconnectAttempts: number;
}