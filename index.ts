// declarative-mcp.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: any) => Promise<any>;
}

interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<string | Buffer>;
}

interface PromptDefinition {
  name: string;
  description: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
  handler: (args: any) => Promise<any>;
}

interface ServerConfig {
  name: string;
  version: string;
  tools?: ToolDefinition[];
  resources?: ResourceDefinition[];
  prompts?: PromptDefinition[];
}

interface RemoteServerConfig extends ServerConfig {
  controlPlaneUrl?: string;
  refreshInterval?: number; // in milliseconds
}

export class DeclarativeMCPServer {
  private server: Server;
  private config: RemoteServerConfig;
  private configRefreshInterval?: NodeJS.Timeout;

  constructor(config: RemoteServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: config.tools?.length ? {} : undefined,
          resources: config.resources?.length ? {} : undefined,
          prompts: config.prompts?.length ? {} : undefined,
        },
      }
    );

    this.registerTools();
    this.registerResources();
    this.registerPrompts();
  }

  private registerTools() {
    if (!this.config.tools?.length) return;

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.config.tools!.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.config.tools!.find(t => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }

      try {
        const result = await tool.handler(request.params.arguments || {});
        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result),
            },
          ],
        };
      } catch (error: any) {
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    });
  }

  private registerResources() {
    if (!this.config.resources?.length) return;

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: this.config.resources!.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = this.config.resources!.find(r => r.uri === request.params.uri);
      if (!resource) {
        throw new Error(`Resource not found: ${request.params.uri}`);
      }

      try {
        const content = await resource.handler();
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: resource.mimeType || "text/plain",
              ...(Buffer.isBuffer(content)
                ? { blob: content.toString("base64") }
                : { text: content }),
            },
          ],
        };
      } catch (error: any) {
        throw new Error(`Resource read failed: ${error.message}`);
      }
    });
  }

  private registerPrompts() {
    if (!this.config.prompts?.length) return;

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.config.prompts!.map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments,
      })),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = this.config.prompts!.find(p => p.name === request.params.name);
      if (!prompt) {
        throw new Error(`Prompt not found: ${request.params.name}`);
      }

      try {
        const result = await prompt.handler(request.params.arguments || {});
        return {
          messages: Array.isArray(result) ? result : [result],
        };
      } catch (error: any) {
        throw new Error(`Prompt execution failed: ${error.message}`);
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}


const weatherServer = new DeclarativeMCPServer({
  name: "weather-server",
  version: "1.0.0",
  tools: [
    {
      name: "get-forecast",
      description: "Get weather forecast for a location",
      inputSchema: {
        type: "object",
        properties: {
          latitude: {
            type: "number",
            description: "Latitude of the location",
          },
          longitude: {
            type: "number",
            description: "Longitude of the location",
          },
        },
        required: ["latitude", "longitude"],
      },
      handler: async ({ latitude, longitude }) => {
        // Implementation here
        const response = await fetch(`https://api.weather.gov/points/${latitude},${longitude}`);
        const data = await response.json();
        return data;
      },
    },
  ],
  resources: [
    {
      uri: "weather://current-conditions",
      name: "Current Weather Conditions",
      description: "Live weather data",
      mimeType: "application/json",
      handler: async () => {
        // Implementation here
        return JSON.stringify({ temp: 72, conditions: "sunny" });
      },
    },
  ],
  prompts: [
    {
      name: "weather-analysis",
      description: "Analyze weather patterns",
      arguments: [
        {
          name: "location",
          description: "Location to analyze",
          required: true,
        },
      ],
      handler: async ({ location }) => ({
        role: "user",
        content: {
          type: "text",
          text: `Analyzing weather patterns for ${location}...`,
        },
      }),
    },
  ],
});

weatherServer.start().catch(console.error);