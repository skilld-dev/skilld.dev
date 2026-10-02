// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { assertWeeklyClaim, buildWeeklySocial, loadWeeklySocial, oauthHeader, publishWeeklySocial, verifySocialDestination } from '../../scripts/lib/weekly-social'

const now = new Date('2026-10-02T05:00:00Z')
const row = { owner: 'author', repo: 'skills', name: 'design', registryPath: '/gh/author/skills/design', authorCount: 3, attribution: 'social', evidence: { url: 'https://x.com/dev/status/123', platform: 'x' } }
const detail = { owner: 'author', repository: 'skills', name: 'design', repositoryUrl: 'https://github.com/author/skills', sourceUrl: 'https://github.com/author/skills/blob/main/design/SKILL.md', sourceGone: false, runCommand: 'npx skilld run author/skills/design' }
const skill = { ...row, sourceUrl: detail.sourceUrl, runCommand: detail.runCommand }

describe('weekly social posts', () => {
  it('keeps feed order, excludes star-only rows and deduplicates Skills', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ computedAt: now.getTime() / 1000, namedSkills: [row, { ...row, name: 'stars', attribution: 'github', authorCount: 0 }, row], fallback: [row] }))
      .mockResolvedValueOnce(Response.json(detail))
    const result = await loadWeeklySocial({ now, fetchImpl })
    expect(result.skills).toEqual([skill])
    expect(fetchImpl.mock.calls.map(call => String(call[0]))).toEqual([
      'https://skilld.dev/api/feed/trending?window=168&limit=20',
      'https://skilld.dev/api/v1/skills/author/skills/design',
    ])
  })

  it('refuses a stale feed before requesting source details', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ computedAt: now.getTime() / 1000 - 3601, namedSkills: [row] }))
    await expect(loadWeeklySocial({ now, fetchImpl })).rejects.toThrow('Trending feed is stale')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects a source link from another repository', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ computedAt: now.getTime() / 1000, namedSkills: [row] }))
      .mockResolvedValueOnce(Response.json({ ...detail, sourceUrl: 'https://github.com/other/skills/blob/main/SKILL.md' }))
    await expect(loadWeeklySocial({ now, fetchImpl })).rejects.toThrow('Skill source does not match its repository')
  })

  it('accepts GitHub source URLs with different casing', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ computedAt: now.getTime() / 1000, namedSkills: [row] }))
      .mockResolvedValueOnce(Response.json({ ...detail, sourceUrl: detail.sourceUrl.replace('author/skills', 'Author/Skills') }))
    expect((await loadWeeklySocial({ now, fetchImpl })).skills[0]?.sourceUrl).toContain('/Author/Skills/')
  })

  it('keeps frozen Skill identity after a repository rename or transfer', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ computedAt: now.getTime() / 1000, namedSkills: [row] }))
      .mockResolvedValueOnce(Response.json({ ...detail, repositoryUrl: 'https://github.com/new-owner/new-repo', sourceUrl: 'https://github.com/new-owner/new-repo/blob/main/design/SKILL.md' }))
    const result = await loadWeeklySocial({ now, fetchImpl })
    expect(result.skills[0]).toMatchObject({ owner: 'author', repo: 'skills', sourceUrl: 'https://github.com/new-owner/new-repo/blob/main/design/SKILL.md' })
  })

  it('sends nothing for an empty week', () => {
    expect(buildWeeklySocial([], now)).toEqual({ _tag: 'empty', week: '2026-09-28' })
  })

  it('renders provenance, run commands and disables Discord mentions', () => {
    const result = buildWeeklySocial([skill], now)
    expect(result._tag).toBe('ready')
    if (result._tag !== 'ready')
      return
    expect(result.x.text).toContain(detail.sourceUrl)
    expect(result.x.text).toContain(row.evidence.url)
    expect(result.discord.embeds[0]?.description).toContain(detail.runCommand)
    expect(result.discord.embeds[0]?.description).toContain('3 devs mentioned it.')
    expect(result.discord.embeds[0]?.description).toContain(row.evidence.url)
    expect(result.discord.allowed_mentions).toEqual({ parse: [] })
  })

  it('reduces the X selection to fit the standard post limit', () => {
    const result = buildWeeklySocial(Array.from({ length: 5 }, (_, i) => ({ ...skill, owner: 'a'.repeat(39), name: `${'b'.repeat(60)}${i}` })), now)
    expect(result._tag).toBe('ready')
    if (result._tag !== 'ready')
      return
    expect(result.x.text.replace(/https:\/\/\S+/g, 'x'.repeat(23)).length).toBeLessThanOrEqual(280)
    expect(result.discord.embeds).toHaveLength(5)
  })
})

describe('posting identity', () => {
  const credentials = { consumerKey: 'key', consumerSecret: 'secret', accessToken: 'token', accessSecret: 'token-secret' }
  it('signs the RFC 5849 reference request', () => {
    const header = oauthHeader('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', {
      consumerKey: 'dpf43f3p2l4k3l03',
      consumerSecret: 'kd94hf93k423kf44',
      accessToken: 'nnch734d00sl2jdk',
      accessSecret: 'pfkkdhi9sl3r4s00',
    }, { nonce: 'kllo9940pd9333jh', timestamp: 1191242096 })
    expect(header).toContain('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"')
  })

  it('refuses credentials belonging to a personal X account', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { id: '1', username: 'harlan_zw' } }))
    await expect(verifySocialDestination({ _tag: 'x', username: 'skilld_dev', credentials }, fetchImpl)).rejects.toThrow('X credentials belong to another account')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('accepts only the configured Discord server and channel', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ guild_id: 'wrong-server', channel_id: '2' }))
    await expect(verifySocialDestination({ _tag: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/token', channelId: '2' }, fetchImpl)).rejects.toThrow('Discord webhook belongs to another server or channel')
  })

  it('publishes to the checked Discord channel and returns its confirmed message ID', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ guild_id: '931135234261532713', channel_id: '2' }))
      .mockResolvedValueOnce(Response.json({ id: '123' }))
    const result = await publishWeeklySocial({ _tag: 'discord', webhookUrl: 'https://discord.com/api/webhooks/1/token', channelId: '2' }, buildWeeklySocial([skill], now), fetchImpl)
    expect(result).toEqual({ _tag: 'sent', id: '123' })
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://discord.com/api/webhooks/1/token?wait=true')
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).allowed_mentions).toEqual({ parse: [] })
  })

  it('never retries a publish whose response was lost', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: { username: 'skilld_dev' } }))
      .mockRejectedValueOnce(new Error('Connection lost'))
    await expect(publishWeeklySocial({ _tag: 'x', username: 'skilld_dev', credentials }, buildWeeklySocial([skill], now), fetchImpl)).rejects.toThrow('Connection lost')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('requires a persisted claim owned by this run before sending', () => {
    expect(() => assertWeeklyClaim({ total_count: 0, artifacts: [] }, '42')).toThrow('This run does not own the weekly claim')
    expect(() => assertWeeklyClaim({ total_count: 1, artifacts: [{ workflow_run: { id: 41 } }] }, '42')).toThrow('This run does not own the weekly claim')
    assertWeeklyClaim({ total_count: 1, artifacts: [{ workflow_run: { id: 42 } }] }, '42')
  })
})
