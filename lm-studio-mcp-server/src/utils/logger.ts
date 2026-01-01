import winston from 'winston';
import { ServerConfig } from '../config/index.js';

let logger: winston.Logger;

export const initializeLogger = (config: ServerConfig): winston.Logger => {
  logger = winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'lm-studio-mcp-server' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ],
  });

  return logger;
};

export const getLogger = (): winston.Logger => {
  if (!logger) {
    throw new Error('Logger not initialized. Call initializeLogger first.');
  }
  return logger;
};