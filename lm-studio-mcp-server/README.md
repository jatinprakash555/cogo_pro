# LM Studio MCP Server

A Model Context Protocol (MCP) server that seamlessly integrates Kiro with LM Studio, enabling persistent and automatic collaboration between the two systems.

## Features

- 🔄 **Automatic Discovery**: Finds and connects to LM Studio instances automatically
- 🤖 **Multi-Model Support**: Works with all your LM Studio models (Qwen, DeepSeek, etc.)
- 🧠 **Intelligent Context**: Gathers and manages project context automatically
- 🔧 **Code Tools**: Analyze, generate, explain, and refactor code
- 🔌 **MCP Compliant**: Follows standard MCP protocol for seamless integration
- 🚀 **High Performance**: Optimized for large codebases and long conversations
- 🛡️ **Robust Error Handling**: Automatic reconnection and graceful degradation

## Quick Start

### Installation

```bash
npm install -g lm-studio-mcp-server
```

### Basic Usage

1. Start LM Studio and load your preferred model
2. Run the MCP server:
   ```bash
   lm-studio-mcp-server
   ```
3. The server will automatically discover your LM Studio instance and connect

### Configuration

Create a `lm-studio-mcp.config.json` file:

```json
{
  "lmStudioEndpoint": "http://10.171.217.128:1234",
  "defaultModel": "",
  "maxContextTokens": 4096,
  "logLevel": "info",
  "discoveryEnabled": true
}
```

Or use environment variables:

```bash
export LM_STUDIO_ENDPOINT="http://10.171.217.128:1234"
export DEFAULT_MODEL="qwen-4b"
export LOG_LEVEL="debug"
lm-studio-mcp-server
```

## Available Tools

### Code Analysis
```json
{
  "name": "code-analyze",
  "arguments": {
    "code": "function example() { return 'hello'; }",
    "language": "javascript",
    "analysisType": "quality"
  }
}
```

### Code Generation
```json
{
  "name": "code-generate",
  "arguments": {
    "specification": "Create a REST API endpoint for user authentication",
    "language": "typescript",
    "includeContext": true
  }
}
```

### Code Explanation
```json
{
  "name": "code-explain",
  "arguments": {
    "code": "const result = array.reduce((acc, item) => acc + item, 0);",
    "language": "javascript"
  }
}
```

### Model Management
```json
{
  "name": "model-list"
}
```

```json
{
  "name": "model-switch",
  "arguments": {
    "modelId": "deepseek-r1"
  }
}
```

## CLI Commands

### Test Connection
```bash
lm-studio-mcp-server --test
```

### Discover Endpoints
```bash
lm-studio-mcp-server --discover
```

### Show Configuration
```bash
lm-studio-mcp-server --config
```

### Help
```bash
lm-studio-mcp-server --help
```

## Integration with Kiro

### Automatic Setup
The server automatically creates the necessary MCP configuration for Kiro. Simply run:

```bash
lm-studio-mcp-server --setup-kiro
```

### Manual Setup
Add to your Kiro MCP configuration (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "lm-studio": {
      "command": "lm-studio-mcp-server",
      "args": [],
      "env": {
        "LOG_LEVEL": "info"
      },
      "disabled": false,
      "autoApprove": ["model-list", "context-refresh"]
    }
  }
}
```

## Configuration Options

| Option | Environment Variable | Default | Description |
|--------|---------------------|---------|-------------|
| `lmStudioEndpoint` | `LM_STUDIO_ENDPOINT` | Auto-discover | LM Studio API endpoint |
| `defaultModel` | `DEFAULT_MODEL` | Auto-select | Default model to use |
| `maxContextTokens` | `MAX_CONTEXT_TOKENS` | 4096 | Maximum context size |
| `reconnectAttempts` | `RECONNECT_ATTEMPTS` | 5 | Connection retry attempts |
| `reconnectDelay` | `RECONNECT_DELAY` | 1000 | Retry delay in ms |
| `logLevel` | `LOG_LEVEL` | info | Logging level |
| `discoveryEnabled` | `DISCOVERY_ENABLED` | true | Enable auto-discovery |
| `discoveryInterval` | `DISCOVERY_INTERVAL` | 30000 | Discovery interval in ms |

## Development

### Setup
```bash
git clone <repository>
cd lm-studio-mcp-server
npm install
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
# Unit tests
npm test

# Integration tests (requires running LM Studio)
npm run test:integration

# Performance tests
npm run test:performance
```

### Building
```bash
npm run build
```

## Troubleshooting

### Connection Issues
1. Ensure LM Studio is running and accessible
2. Check firewall settings
3. Verify the endpoint URL
4. Try auto-discovery: `lm-studio-mcp-server --discover`

### Model Issues
1. List available models: `lm-studio-mcp-server --test`
2. Ensure models are loaded in LM Studio
3. Check model compatibility

### Performance Issues
1. Reduce `maxContextTokens` for large projects
2. Enable context pruning
3. Use faster models for simple tasks

### Logging
Enable debug logging for detailed information:
```bash
LOG_LEVEL=debug lm-studio-mcp-server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: Report bugs and request features
- Documentation: Check the wiki for detailed guides
- Community: Join discussions in the issues section