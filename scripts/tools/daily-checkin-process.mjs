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

/**
 * gh resolves credentials from the environment before its keyring, so one
 * stale GITHUB_TOKEN or GH_TOKEN overrides a valid `gh auth` login and every
 * call 401s. When a token is present, validate it once with a cheap
 * authenticated call; when gh rejects it, drop both variables so gh falls
 * back to the keyring.
 */
export function ghEnv(env, spawn) {
  if (!(env.GITHUB_TOKEN || env.GH_TOKEN))
    return env
  try {
    runReadOnlyProcess(spawn, 'gh', ['api', 'user'], {
      encoding: 'utf8',
      env: { ...env, NO_COLOR: '1' },
    })
    return env
  }
  catch {
    // gh rejected the environment token (or the check itself could not run),
    // so the keyring login is the better credential source either way.
    const { GITHUB_TOKEN: _staleToken, GH_TOKEN: _staleAltToken, ...keyringEnv } = env
    return keyringEnv
  }
}

/**
 * Commands whose subprocesses authenticate to GitHub share the sanitized
 * environment; everything else inherits the caller's environment untouched.
 * git serves github.com credentials through the `gh auth git-credential`
 * helper, which reads the same environment variables gh does, so a stale
 * token breaks `git fetch` exactly the way it breaks gh. Resolution is
 * handed over lazily so commands that never touch GitHub never pay for it.
 */
export function subprocessEnv(command, baseEnv, resolveGitHubEnv) {
  if (command === 'gh' || command === 'git')
    return resolveGitHubEnv()
  return baseEnv
}
