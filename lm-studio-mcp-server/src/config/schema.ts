import { z } from 'zod';

export const ServerConfigSchema = z.object({
  lmStudioEndpoint: z.string().url().default('http://localhost:1234'),
  defaultModel: z.string().default(''),
  maxContextTokens: z.number().positive().default(4096),
  reconnectAttempts: z.number().positive().default(5),
  reconnectDelay: z.number().positive().default(1000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  discoveryEnabled: z.boolean().default(true),
  discoveryInterval: z.number().positive().default(30000), // 30 seconds
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const validateConfig = (config: unknown): ServerConfig => {
  return ServerConfigSchema.parse(config);
};