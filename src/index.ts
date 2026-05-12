#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBasicTools } from "./tools/basic.js";
import { registerAdvancedTools } from "./tools/advanced.js";

const server = new McpServer({
  name: "japan-law-mcp",
  version: "1.0.0",
});

// Register all tools
registerBasicTools(server);
registerAdvancedTools(server);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("japan-law-mcp server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
