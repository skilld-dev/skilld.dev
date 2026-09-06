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

function withoutGitHubEnvTokens(env) {
  const stripped = { ...env }
  delete stripped.GITHUB_TOKEN
  delete stripped.GH_TOKEN
  return stripped
}

function isStaleGitHubEnvToken(message) {
  return /HTTP 401.*Bad credentials/i.test(message)
}

/**
 * Check-in probes are read-only, so a process terminated by the host can retry
 * once without duplicating a mutation. `gh` prefers a GITHUB_TOKEN/GH_TOKEN env
 * token over keyring auth, so an HTTP 401 "Bad credentials" retries once with
 * those stripped and a working `gh auth login` can answer instead. Ordinary
 * nonzero exits remain final.
 */
export function runReadOnlyProcess(spawn, command, args, options = {}) {
  let result = spawn(command, args, options)
  if (result.status === null)
    result = spawn(command, args, options)
  if (result.status === 0)
    return String(result.stdout).trim()
  const message = failureMessage(command, result).slice(0, 800)
  if (isStaleGitHubEnvToken(message)) {
    const retried = spawn(command, args, { ...options, env: withoutGitHubEnvTokens(options.env) })
    if (retried.status === 0)
      return String(retried.stdout).trim()
    throw new Error(failureMessage(command, retried).slice(0, 800))
  }
  throw new Error(message)
}
