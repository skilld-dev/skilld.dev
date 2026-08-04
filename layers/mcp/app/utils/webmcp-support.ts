export interface WebMcpInputSchema {
  [key: string]: unknown
}

export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export type WebMcpExecutionResult
  = | { _tag: 'ok', data: Record<string, unknown> }
    | { _tag: 'error', message: string }

export interface WebMcpTool {
  name: string
  description: string
  inputSchema: WebMcpInputSchema
  execute: (input: Record<string, unknown>) => Promise<WebMcpExecutionResult>
  annotations: WebMcpToolAnnotations
}

export interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}

export function getWebMcpModelContext(doc: Document): WebMcpModelContext | null {
  const modelContext = (doc as Document & { modelContext?: unknown }).modelContext
  if (!modelContext || typeof (modelContext as WebMcpModelContext).registerTool !== 'function')
    return null
  return modelContext as WebMcpModelContext
}
