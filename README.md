Here's an enhanced README with more technical details based on the codebase:

# mcp-remote-server

A configurable Model Context Protocol (MCP) server that dynamically loads its capabilities from a remote configuration. This leverages the [ModelContextProtocol](https://github.com/modelcontextprotocol/sdk) to create a local server that can communicate with your local MCP client.

## Overview

`mcp-remote-server` acts as a bridge between MCP clients and remote APIs. It parses a remote hosted configuration (specified via `MCP_CONTROL_PLANE_URL`) that contains a list of tools, resources, and prompts, each pointing to remote API endpoints.

### Key Features

- **Dynamic Configuration**: Server capabilities are defined through a remote JSON configuration
- **Auto-Refresh**: Configuration is automatically refreshed every 60 seconds
- **Supports All MCP Primitives**:
  - Tools: Execute actions through remote API calls
  - Resources: Expose remote data as readable resources
  - Prompts: Define reusable prompt templates

### Configuration Format

```json
{
  "tools": [{
    "name": "tool-name",
    "description": "Tool description",
    "inputSchema": {
      "type": "object",
      "properties": {
        // JSON Schema for tool inputs
      }
    },
    "handler": "https://api.example.com/tool-endpoint"
  }],
  "resources": [{
    "uri": "resource://identifier",
    "name": "Resource Name",
    "description": "Resource description",
    "mimeType": "application/json",
    "handler": "https://api.example.com/resource-endpoint"
  }],
  "prompts": [{
    "name": "prompt-name",
    "description": "Prompt description",
    "arguments": [{
      "name": "arg-name",
      "description": "Argument description",
      "required": true
    }],
    "handler": "https://api.example.com/prompt-endpoint"
  }]
}
```

### Handler API Requirements

Remote handlers must return appropriately formatted responses:

- **Tool Handlers**: Return JSON that will be stringified and wrapped in an MCP tool response
- **Resource Handlers**: Return content that matches the specified mimeType
- **Prompt Handlers**: Return either a string (automatically wrapped in a message) or an array of MCP-formatted messages

## Installation

```bash
bun install
```

## Usage

1. Set your control plane URL:
```bash
export MCP_CONTROL_PLANE_URL="https://your-config-endpoint"
```

2. Run the server:
```bash
bun run index.ts
```

## Limitations

- Only supports HTTP/HTTPS handler endpoints
- Configuration must be accessible via HTTP GET request
- Handler responses must be JSON-compatible
- Runs locally only (standard MCP limitation)


This project was created using `bun init` in bun v1.1.32. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime. I chose Bun because it's fast and I wanted to try something a little different.

This project also uses [Biome](https://biomejs.dev/) for type checking and linting. I chose Biome for the same reason as Bun. I wanted something different and I wish JS had a `gofmt`-like tool. This is a good start.

