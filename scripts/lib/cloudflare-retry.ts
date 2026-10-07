import type { ProductionCommand, ProductionCommandResult } from './production-deploy'

/**
 * Cloudflare API faults that a later identical request can pass. On
 * 2026-10-07 the Artifact signer deploy failed once with code 10013 ("An
 * unknown error has occurred") and passed on a rerun. Authentication,
 * permission, and configuration errors never match, so they fail at once.
 */
const API_FAILURE = /A request to the Cloudflare API \([^)]*\) failed/
const API_FAULT = /\[code: 10013\]|An unknown error has occurred|\b50[0234]\b|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout/
const NETWORK_FAULT = /\bfetch failed\b|ECONNRESET|ETIMEDOUT|socket hang up/

export function isTransientCloudflareFailure(output: string): boolean {
  return (API_FAILURE.test(output) && API_FAULT.test(output)) || NETWORK_FAULT.test(output)
}

export interface TransientRetryOptions {
  wait: (milliseconds: number) => Promise<void>
  log: (message: string) => void
  /** One delay per retry. Two retries cover a fault that clears within a minute. */
  delaysMs?: readonly number[]
}

const DEFAULT_DELAYS_MS = [15_000, 45_000] as const

/**
 * Runs a Cloudflare command again after a transient API fault. Every other
 * result returns unchanged, including the last failure when retries run out.
 * A repeated `wrangler deploy` uploads the same script again, so a retry after
 * a partial deploy leaves the same code active.
 */
export function withTransientRetry(command: ProductionCommand, options: TransientRetryOptions): ProductionCommand {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS
  return async (args) => {
    let result: ProductionCommandResult = await command(args)
    for (const [index, delay] of delays.entries()) {
      if (result._tag === 'passed' || !isTransientCloudflareFailure(`${result.stdout}\n${result.stderr}`))
        return result
      options.log(`Cloudflare API fault on attempt ${index + 1} of ${delays.length + 1}. Retrying in ${delay / 1000}s.`)
      await options.wait(delay)
      result = await command(args)
    }
    return result
  }
}
