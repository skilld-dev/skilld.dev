const tokenEnvNames = ['GH_TOKEN', 'GITHUB_TOKEN']

function spawnStatus(spawn, command, args, env) {
  return spawn(command, args, { env, encoding: 'utf8' }).status
}

function withoutKeys(env, keys) {
  const stripped = { ...env }
  for (const key of keys)
    delete stripped[key]
  return stripped
}

/**
 * gh prefers a GH_TOKEN/GITHUB_TOKEN inherited from the environment over its
 * own keyring login, so one expired runner token breaks every gh call while a
 * valid login sits unused. Validate the inherited token once: when gh rejects
 * it and accepts the keyring, hand child processes an env without the
 * rejected token. When both fail, the token is not the culprit, so the env is
 * passed through unchanged and the probes report the real failure.
 */
export function resolveGithubChildEnv(spawn, env) {
  const tokenNames = tokenEnvNames.filter(name => env[name])
  if (tokenNames.length === 0)
    return { env, rejectedTokens: [] }
  if (spawnStatus(spawn, 'gh', ['auth', 'status'], env) === 0)
    return { env, rejectedTokens: [] }
  const strippedEnv = withoutKeys(env, tokenNames)
  if (spawnStatus(spawn, 'gh', ['auth', 'status'], strippedEnv) !== 0)
    return { env, rejectedTokens: [] }
  return { env: strippedEnv, rejectedTokens: tokenNames }
}
