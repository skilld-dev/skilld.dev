# ChatGPT and Claude directory listings

The skilld MCP server at `https://skilld.dev/api/mcp` is listed in two directories.
Both listings point at the same server, so a server deploy updates both.

| Directory | Portal | Listing source |
| --- | --- | --- |
| [ChatGPT](https://chatgpt.com) and Codex plugin directory | [platform.openai.com/plugins](https://platform.openai.com/plugins) | `integrations/openai-plugin/` |
| Claude Connectors Directory | [claude.ai/directory/manage](https://claude.ai/directory/manage) | the Claude listing fields below |

## What review checks

Both portals scan the tools from the live server. Every tool must keep these properties:

- A `title`, and explicit `readOnlyHint`, `destructiveHint`, and `openWorldHint` values.
- A description that says what the tool does. It must not tell the model how to behave, call other apps, or fetch instructions from a URL.
- Output that holds only what the request needs. Do not add request IDs, trace IDs, or debug fields.

`layers/mcp/shared/mcp-tools.ts` holds the tools. The toolkit answers 403 to a request whose `Origin` header is not in `mcp.security.allowedOrigins` in `nuxt.config.ts`.

## Change a tool

1. Deploy the change.
2. In the [OpenAI](https://openai.com) portal, open the plugin, select **MCPs**, then **Rescan**. OpenAI also scans once a day.
3. A new tool stays unavailable in ChatGPT until the scan approves it. Keep the old input schema working until then.
4. Claude syncs tools from the server. If the portal flags a tool, fix it on the server.

## OpenAI plugin

The publisher must be an OpenAI organization owner or hold **Apps Management Write**.
The organization must complete individual verification for the name in `developerName`.
A project with EU data residency cannot submit a plugin with an MCP server.

1. Build the ZIP from the package directory:

   ```sh
   cd integrations/openai-plugin && zip -r "$TMPDIR/skilld-openai-plugin.zip" plugin.json mcp.json assets
   ```

2. Upload the ZIP. Select **Upload new or existing plugin** and choose the verified developer identity.
3. Connect the `skilld` MCP server and choose **No authentication**.
4. The portal shows a domain-verification token. Set it as a Worker secret:

   ```sh
   pnpm exec wrangler secret put NUXT_OPENAI_APPS_CHALLENGE --config wrangler.jsonc
   ```

   Then check that `https://skilld.dev/.well-known/openai-apps-challenge` prints the token, and complete the challenge.
5. Scan the tools and resolve every finding.
6. In **Review details**, add the demo video URL. The review needs a video of the five positive test cases in ChatGPT.
7. Submit for review, accept the policy attestations, and publish after approval.

To change the listing text, the test cases, or the icon, edit `plugin.json`, raise `version`, and upload a new ZIP.

## Claude connector

Any paid Claude plan can submit. Use these fields in the portal.

| Field | Value |
| --- | --- |
| Server URL | `https://skilld.dev/api/mcp` |
| Server name | skilld |
| One-liner | Search curated agent skills, see who wrote each one, and get the command that runs it in your coding agent. |
| Description | `longDescription` in `integrations/openai-plugin/plugin.json` |
| Categories | Developer tools |
| Documentation URL | `https://skilld.dev/developers?setup=mcp&app=claude` |
| Privacy policy URL | `https://skilld.dev/privacy` |
| Support contact | `https://github.com/skilld-dev/skilld.dev/issues` |
| Icon | `public/logo-icon.png` |
| Slug | `skilld`. The slug is permanent after publication |
| Use cases | Find agent skills by topic, check provenance before a run, open curated collections, get run and install commands |
| Requirements | None. Every tool works without an account |
| Data access | Reads data only |
| Company | Harlan Wilton, `https://skilld.dev`, `harlan@harlanzw.com` |
| Authentication | No authentication |
| Data handling | First-party API. No health data. No sponsored content |
| Test account | None. Every tool works without sign-in |

Before you submit, add the server in Claude as a custom connector and call each tool once.
After submission, Anthropic scans the server and lists it as a Community connector.
Status and reviewer feedback appear in the portal. Escalations go to `mcp-review@anthropic.com`.
