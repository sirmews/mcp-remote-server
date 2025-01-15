# mcp-remote-server

This leverages the [ModelContextProtocol](https://github.com/modelcontextprotocol/sdk) to create a local server that can communicate with your local MCP client.

I'm using this to achieve simple lightweight MCP experiences that don't require making a complete server in every instance. The goal is to be able to store a remote config that is easily adaptable to my current use case.

`mcp-remote-server` parses a remote hosted config i.e. `MCP_CONTROL_PLANE_URL` that contains a list of tools, resources and prompts that point to remote apis.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.32. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime. I chose Bun because it's fast and I wanted to try something a little different.

This project also uses [Biome](https://biomejs.dev/) for type checking and linting. I chose Biome for the same reason as Bun. I wanted something different and I wish JS had a `gofmt`-like tool. This is a good start.

