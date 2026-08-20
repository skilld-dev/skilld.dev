export interface PrivateArtifactFeatureEnv {
  ARTIFACT_PRIVATE_ACCESS_ENABLED?: string
  GITHUB_APP_ID?: string
  GITHUB_APP_CLIENT_ID?: string
  GITHUB_APP_CLIENT_SECRET?: string
  GITHUB_APP_PRIVATE_KEY_PKCS8?: string
  GITHUB_APP_WEBHOOK_SECRET?: string
  ARTIFACT_KEY_WRAP_KEY_PRIMARY?: string
  ARTIFACT_GRANT_IDEMPOTENCY_KEY?: string
  NUXT_TOKEN_KEY?: string
}

const requiredPrivateArtifactConfiguration = [
  'GITHUB_APP_ID',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY_PKCS8',
  'GITHUB_APP_WEBHOOK_SECRET',
  'ARTIFACT_KEY_WRAP_KEY_PRIMARY',
  'ARTIFACT_GRANT_IDEMPOTENCY_KEY',
  'NUXT_TOKEN_KEY',
] as const satisfies readonly (keyof PrivateArtifactFeatureEnv)[]

export function privateArtifactAccessEnabled(env: PrivateArtifactFeatureEnv): boolean {
  return env.ARTIFACT_PRIVATE_ACCESS_ENABLED === 'true'
    && requiredPrivateArtifactConfiguration.every(name => Boolean(env[name]?.trim()))
}
