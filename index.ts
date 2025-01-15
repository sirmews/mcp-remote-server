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

// Types for server configuration
interface ServerConfig {
	tools?: Array<{
		name: string;
		description: string;
		inputSchema: object;
		handler: string;
	}>;
	resources?: Array<{
		uri: string;
		name: string;
		description?: string;
		mimeType?: string;
		handler: string;
	}>;
	prompts?: Array<{
		name: string;
		description: string;
		arguments?: Array<{
			name: string;
			description?: string;
			required?: boolean;
		}>;
		handler: string;
	}>;
}

// Get control plane URL from args or env
const controlPlaneUrl = process.argv[2] || process.env.MCP_CONTROL_PLANE_URL;
if (!controlPlaneUrl) {
	console.error(
		"Please provide control plane URL as argument or set MCP_CONTROL_PLANE_URL",
	);
	process.exit(1);
}

export class RemoteMCPServer {
	private server: Server;
	private serverConfig?: ServerConfig;
	private configRefreshInterval?: ReturnType<typeof setInterval>;

	constructor(private controlPlaneUrl: string) {
		// Initialize server with base configuration
		this.server = new Server(
			{
				name: "remote-mcp-server",
				version: "0.1.0",
			},
			{
				capabilities: {
					tools: {},
					resources: {},
					prompts: {},
					logging: {
						supportedLevels: ["error", "warn", "info", "debug"],
					},
				},
			},
		);
	}

	/**
	 * Fetches the config from the control plane
	 * @returns The config
	 */
	private async fetchConfig(): Promise<ServerConfig> {
		try {
			const response = await fetch(this.controlPlaneUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch config: ${response.statusText}`);
			}
			return await response.json();
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Control plane error: ${error.message}`);
			}
			throw new Error("Control plane error: unknown error");
		}
	}

	/**
	 * Calls the remote handler
	 * @param handlerUrl The URL of the handler
	 * @param args The arguments to pass to the handler
	 * @returns The result of the handler
	 */
	private async callRemoteHandler(
		handlerUrl: string,
		args?: Record<string, unknown>,
	): Promise<any> {
		try {
			const response = await fetch(handlerUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(args || {}),
			});

			// Log raw response text first
			const rawText = await response.text();

			if (!response.ok) {
				this.server.sendLoggingMessage({
					level: "error",
					data: `Handler failed with status: ${response.status} ${response.statusText}`,
				});
				throw new Error(`Handler failed: ${response.statusText}`);
			}

			const result = JSON.parse(rawText);
			return result;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Remote handler error: ${error.message}`);
			}
			throw new Error("Remote handler error: unknown error");
		}
	}

	/**
	 * Updates the server capabilities based on the config that was fetched
	 * @param config The config to update the server capabilities with
	 */
	private async updateServerCapabilities(config: ServerConfig) {
		// Register tools
		if (config.tools?.length) {
			this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
				tools: config.tools!.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
				})),
			}));

			this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
				const tool = config.tools!.find((t) => t.name === request.params.name);
				if (!tool) {
					throw new Error(`Tool not found: ${request.params.name}`);
				}

				try {
					const result = await this.callRemoteHandler(
						tool.handler,
						request.params.arguments,
					);
					return {
						content: [
							{
								type: "text",
								text:
									typeof result === "string"
										? result
										: JSON.stringify(result, null, 2),
							},
						],
					};
				} catch (error: any) {
					throw new Error(`Tool execution failed: ${error.message}`);
				}
			});
		}

		// Register resources
		if (config.resources?.length) {
			this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
				resources: config.resources!.map((resource) => ({
					uri: resource.uri,
					name: resource.name,
					description: resource.description,
					mimeType: resource.mimeType,
				})),
			}));

			this.server.setRequestHandler(
				ReadResourceRequestSchema,
				async (request) => {
					const resource = config.resources!.find(
						(r) => r.uri === request.params.uri,
					);
					if (!resource) {
						throw new Error(`Resource not found: ${request.params.uri}`);
					}

					try {
						const content = await this.callRemoteHandler(resource.handler);
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
				},
			);
		}

		// Register prompts
		if (config.prompts?.length) {
			this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
				prompts: config.prompts!.map((prompt) => ({
					name: prompt.name,
					description: prompt.description,
					arguments: prompt.arguments,
				})),
			}));

			this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
				const prompt = config.prompts!.find(
					(p) => p.name === request.params.name,
				);
				if (!prompt) {
					throw new Error(`Prompt not found: ${request.params.name}`);
				}

				try {
					const result = await this.callRemoteHandler(
						prompt.handler,
						request.params.arguments,
					);
					const messages = Array.isArray(result)
						? result
						: [
								{
									role: "user",
									content: {
										type: "text",
										text: result,
									},
								},
							];
					return { messages };
				} catch (error: any) {
					throw new Error(`Prompt execution failed: ${error.message}`);
				}
			});
		}
	}

	/**
	 * Refreshes the config from the control plane and updates the server capabilities
	 */
	private async refreshConfig() {
		try {
			const newConfig = await this.fetchConfig();

			// Check if config has changed
			// TODO: add a version and id to each config so this can be simplified
			if (JSON.stringify(newConfig) !== JSON.stringify(this.serverConfig)) {
				await this.updateServerCapabilities(newConfig);
				this.serverConfig = newConfig;
			}
		} catch (error) {
			console.error("Failed to refresh configuration:", error);
		}
	}

	public async start() {
		// Initial config setup
		this.serverConfig = await this.fetchConfig();
		await this.updateServerCapabilities(this.serverConfig);

		// Connect transport first
		const transport = new StdioServerTransport();
		await this.server.connect(transport);

		// Now that transport is connected, we can log
		this.server.sendLoggingMessage({
			level: "info",
			data: "Transport connected, fetching initial configuration...",
		});

		// Setup refresh interval after connection
		this.configRefreshInterval = setInterval(() => this.refreshConfig(), 60000);

		this.server.sendLoggingMessage({
			level: "info",
			data: "Remote MCP Server initialized and ready",
		});
	}

	/**
	 * Stops the server.
	 * TODO: look further into how to stop the server gracefully and clean up resources
	 */
	public async stop() {
		if (this.configRefreshInterval) {
			clearInterval(this.configRefreshInterval);
		}
	}
}

// Start server
const server = new RemoteMCPServer(controlPlaneUrl);
server.start().catch(console.error);
