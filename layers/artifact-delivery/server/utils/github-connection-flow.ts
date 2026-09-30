import { parseReturnTo } from '#shared/return-to'
import { bytesToBase64Url } from './encoding'

export const GITHUB_CONNECTION_STATE_COOKIE = 'github_connection_state'
export const GITHUB_CONNECTION_RETURN_COOKIE = 'github_connection_return'

export function createGithubConnectionState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function githubConnectionReturnTo(value: string | undefined): string {
  return parseReturnTo(value)
}

export function githubConnectionStateMatches(expected: string | undefined, actual: string): boolean {
  if (!expected || expected.length !== actual.length)
    return false
  let different = 0
  for (let index = 0; index < expected.length; index++)
    different |= expected.charCodeAt(index) ^ actual.charCodeAt(index)
  return different === 0
}
