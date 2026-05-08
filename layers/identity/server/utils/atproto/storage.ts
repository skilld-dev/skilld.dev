import { OAuthSessionStore } from './oauth-session-store'
import { OAuthStateStore } from './oauth-state-store'

export const OAUTH_STORAGE_BASE = 'atproto:oauth'

export function createOAuthStorage() {
  return {
    stateStore: new OAuthStateStore(),
    sessionStore: new OAuthSessionStore(),
  }
}
