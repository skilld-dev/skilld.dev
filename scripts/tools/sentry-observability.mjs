function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function nonnegativeInteger(value) {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * Split issues by whether the window created them or merely saw them again.
 *
 * The probe used to ask Sentry for `firstSeen:>{since}`, which can only ever
 * report first occurrences. On 2026-08-06 that hid 686 events recurring on five
 * known ids, all of them after the deploy that was supposed to fix those ids,
 * and the archive recorded a clean night. A recurrence is the signal that a fix
 * did not hold, so it has to reach the report on its own.
 */
export function parseSentryIssuesResponse(status, body, tokenSource, sinceIso, limit) {
  if (status === 401 || status === 403) {
    const origin = tokenSource ? ` Token came from ${tokenSource}.` : ''
    return {
      _tag: 'missing_observability',
      status,
      diagnostic: status === 403
        ? `Sentry token lacks issue-read permission (HTTP 403).${origin} Use a token with event:read + org:read, such as the one sentry-cli writes to ~/.sentryclirc.`
        : `Sentry authorization failed with HTTP 401 (token missing or expired).${origin}`,
    }
  }
  if (status < 200 || status >= 300) {
    return {
      _tag: 'provider_failure',
      status,
      diagnostic: `Sentry issues request failed with HTTP ${status}.`,
    }
  }
  if (!Array.isArray(body)) {
    return {
      _tag: 'parse_failure',
      status,
      diagnostic: 'Sentry issues response was not an array.',
    }
  }
  const windowStart = typeof sinceIso === 'string' ? Date.parse(sinceIso) : Number.NaN
  const newIssues = []
  const recurringIssues = []
  for (const candidate of body) {
    const issue = record(candidate)
    const count = nonnegativeInteger(issue?.count)
    const userCount = nonnegativeInteger(issue?.userCount)
    if (!issue
      || typeof issue.id !== 'string'
      || typeof issue.shortId !== 'string'
      || typeof issue.title !== 'string'
      || typeof issue.culprit !== 'string'
      || typeof issue.permalink !== 'string'
      || count === null
      || userCount === null
      || typeof issue.firstSeen !== 'string'
      || typeof issue.lastSeen !== 'string') {
      return {
        _tag: 'parse_failure',
        status,
        diagnostic: 'Sentry issues response contained an invalid issue.',
      }
    }
    const parsed = {
      id: issue.id,
      shortId: issue.shortId,
      title: issue.title.slice(0, 160),
      culprit: issue.culprit.slice(0, 240),
      permalink: issue.permalink,
      count,
      userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
    }
    // An unparseable window start must not silently reclassify everything as a
    // recurrence, so an unknown boundary keeps the old, louder reading.
    const bornInWindow = Number.isNaN(windowStart) || Date.parse(issue.firstSeen) >= windowStart
    if (bornInWindow)
      newIssues.push(parsed)
    else
      recurringIssues.push(parsed)
  }
  return {
    _tag: 'available',
    newIssues,
    recurringIssues,
    // A full page means Sentry had more to say. Reporting the cap keeps a
    // truncated list from reading as a complete one.
    truncatedAtLimit: typeof limit === 'number' && body.length >= limit,
  }
}

export function countObservabilityFailures(result) {
  return result._tag === 'available' ? 0 : 1
}
