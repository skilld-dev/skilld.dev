// MCP layer: discovery MCP server at /api/mcp (Streamable HTTP, stateless).
// Read-only Loop 1 surface for agent-native discovery: search, skill and
// collection lookup, install-command handoff. Never an execution layer;
// data reaches this layer over HTTP only (ADR-0001).
export default defineNuxtConfig({})
