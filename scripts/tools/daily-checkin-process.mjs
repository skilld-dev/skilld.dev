function failureMessage(command, result) {
  const output = String(result.stderr || result.stdout || '').trim()
  if (output)
    return output
  if (result.error instanceof Error)
    return result.error.message
  if (result.signal)
    return `${command} terminated by ${result.signal}`
  return `${command} exited ${String(result.status)}`
}

/**
 * `gh` prefers GITHUB_TOKEN and GH_TOKEN from the environment over its keyring
 * login, and the routine environment exports an invalid GITHUB_TOKEN. Strip
 * both so every gh call falls back to `gh auth login` credentials.
 */
export function ghProcessEnv(env) {
  const { GITHUB_TOKEN: _githubToken, GH_TOKEN: _ghToken, ...rest } = env
  return rest
}

/**
 * Check-in probes are read-only, so a process terminated by the host can retry
 * once without duplicating a mutation. Ordinary nonzero exits remain final.
 */
export function runReadOnlyProcess(spawn, command, args, options = {}) {
  let result = spawn(command, args, options)
  if (result.status === null)
    result = spawn(command, args, options)
  if (result.status !== 0)
    throw new Error(failureMessage(command, result).slice(0, 800))
  return String(result.stdout).trim()
}
