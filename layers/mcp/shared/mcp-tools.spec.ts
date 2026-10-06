import type { McpToolDeps } from './mcp-tools'
import { describe, expect, it } from 'vitest'
import { mcpTools } from './mcp-tools'

const installCommandTool = mcpTools.find(tool => tool.name === 'install_command')!

function acceptedRefForms(toolDescription: string): string[] {
  const marker = 'Accepted refs:'
  const index = toolDescription.indexOf(marker)
  if (index === -1)
    throw new Error(`tool description has no "${marker}" section`)
  return [...toolDescription.slice(index).matchAll(/"([^"]+)"/g)].map(match => match[1]!)
}

const deps: McpToolDeps = {
  fetchApi: () => {
    throw new Error('fetchApi must not be called')
  },
  reportError: () => {
    throw new Error('reportError must not be called')
  },
}

describe('install_command ref contract', () => {
  it('rejects an npm ref with a failure listing only the accepted forms', async () => {
    const result = await installCommandTool.run(deps, { ref: 'npm:@scope/pkg' })
    expect(result.isError).toBe(true)
    const list = acceptedRefForms(installCommandTool.description).map(form => `"${form}"`).join(', ')
    expect(result.content[0]!.text).toBe(`Unrecognized ref: "npm:@scope/pkg". Accepted forms: ${list}.`)
  })
})
