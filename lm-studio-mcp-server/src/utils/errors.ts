export class LMStudioError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'LMStudioError';
  }
}

export class ConnectionError extends LMStudioError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', 503, originalError);
    this.name = 'ConnectionError';
  }
}

export class ModelError extends LMStudioError {
  constructor(message: string, originalError?: Error) {
    super(message, 'MODEL_ERROR', 400, originalError);
    this.name = 'ModelError';
  }
}

export class ContextError extends LMStudioError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONTEXT_ERROR', 400, originalError);
    this.name = 'ContextError';
  }
}

export class ConfigurationError extends LMStudioError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONFIGURATION_ERROR', 500, originalError);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends LMStudioError {
  constructor(message: string, originalError?: Error) {
    super(message, 'VALIDATION_ERROR', 400, originalError);
    this.name = 'ValidationError';
  }
}

export const isRetryableError = (error: Error): boolean => {
  if (error instanceof ConnectionError) {
    return true;
  }
  
  // Check for specific error messages that indicate retryable conditions
  const retryableMessages = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'socket hang up'
  ];
  
  return retryableMessages.some(msg => 
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
};

export const getErrorRecoveryMessage = (error: Error): string => {
  if (error instanceof ConnectionError) {
    return 'Check that LM Studio is running and accessible. The server will attempt to reconnect automatically.';
  }
  
  if (error instanceof ModelError) {
    return 'Verify that the requested model is available in LM Studio. Use the model-list tool to see available models.';
  }
  
  if (error instanceof ContextError) {
    return 'Check that the workspace path is accessible and contains valid project files.';
  }
  
  if (error instanceof ConfigurationError) {
    return 'Review your configuration settings and environment variables.';
  }
  
  if (error instanceof ValidationError) {
    return 'Check that all required parameters are provided and have valid values.';
  }
  
  return 'Please check the logs for more details and try again.';
};