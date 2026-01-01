import { MCPRequest, MCPResponse } from '@modelcontextprotocol/sdk';

export interface MCPServer {
  initialize(): Promise<void>;
  registerTools(): void;
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  shutdown(): Promise<void>;
}