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

export function parseSentryIssuesResponse(status, body) {
  if (status === 401 || status === 403) {
    return {
      _tag: 'missing_observability',
      status,
      diagnostic: status === 403
        ? 'Sentry token lacks issue-read permission (HTTP 403). The build-plugin token only covers source-map uploads; mint an org auth token with event:read + org:read scope and set SENTRY_AUTH_TOKEN.'
        : 'Sentry authorization failed with HTTP 401 (token missing or expired).',
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
  const newIssues = []
  for (const candidate of body) {
    const issue = record(candidate)
    const count = nonnegativeInteger(issue?.count)
    const userCount = nonnegativeInteger(issue?.userCount)
    if (!issue
      || typeof issue.shortId !== 'string'
      || typeof issue.title !== 'string'
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
    newIssues.push({
      shortId: issue.shortId,
      title: issue.title.slice(0, 160),
      count,
      userCount,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
    })
  }
  return { _tag: 'available', newIssues }
}

export function countObservabilityFailures(result) {
  return result._tag === 'available' ? 0 : 1
}
