# Sentry Setup with MCP

This project is configured with Sentry for error tracking and monitoring, with MCP (Model Context Protocol) integration for AI agent access.

## Configuration Status

✅ **Sentry MCP**: Configured and authenticated
- Organization: `h03`
- Project: `scoresync-tools`
- Region: `https://de.sentry.io`
- MCP Server: `https://mcp.sentry.dev/mcp`

✅ **Sentry SDK**: Installed and initialized
- Package: `@sentry/react` (v10.27.0)
- Vite Plugin: `@sentry/vite-plugin` (v4.6.1)

## Project Details

- **Project Slug**: `scoresync-tools`
- **Project ID**: `4510447371747408`
- **DSN**: `https://373ef2675f19f594f53318e4a1574c3f@o4509020080766976.ingest.de.sentry.io/4510447371747408`

## MCP Configuration

The Sentry MCP server is configured in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Sentry": {
      "url": "https://mcp.sentry.dev/mcp"
    }
  }
}
```

## AI Agent Capabilities

The AI agent can now:
- ✅ Access Sentry project information
- ✅ Search for issues and events
- ✅ Get issue details and stack traces
- ✅ Analyze issues with Seer (AI-powered root cause analysis)
- ✅ Update issue status and assignments
- ✅ View releases and traces
- ✅ Access DSNs and project configuration

## Environment Variables (Optional)

You can optionally set the DSN via environment variable:

```bash
VITE_SENTRY_DSN=https://373ef2675f19f594f53318e4a1574c3f@o4509020080766976.ingest.de.sentry.io/4510447371747408
```

For source map uploads during build, set:

```bash
SENTRY_AUTH_TOKEN=your_auth_token_here
```

## Features Enabled

- **Error Tracking**: Automatic error capture
- **Performance Monitoring**: 100% transaction sampling (development)
- **Session Replay**: 10% of sessions, 100% of error sessions
- **Source Maps**: Automatic upload during build

## Testing MCP Access

You can test MCP access by asking the AI agent:
- "Show me issues in the scoresync-tools project"
- "What errors occurred today?"
- "Analyze issue PROJECT-123"

## Next Steps

1. The SDK is initialized in `services/sentry.ts`
2. Sentry will automatically capture errors and exceptions
3. Use MCP tools to query Sentry data through the AI agent
4. Set `SENTRY_AUTH_TOKEN` for source map uploads in production builds

