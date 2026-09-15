import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { semanticSkillSearch } from '../../layers/registry/server/utils/skill-semantic-search'

const vector = Array.from<number>({ length: 768 }).fill(0.25)
const metadata = { owner: 'example', repo: 'skills', name: 'debugging' }

function setup(cached: unknown = null) {
  const storage = {
    getItem: vi.fn().mockResolvedValue(cached),
    setItem: vi.fn().mockResolvedValue(undefined),
  }
  const ai = { run: vi.fn().mockResolvedValue({ data: [vector] }) }
  const index = { query: vi.fn().mockResolvedValue({ matches: [{ id: 'id', metadata, score: 0.72 }] }) }
  vi.stubGlobal('useStorage', () => storage)
  const event = { context: { platform: { env: { AI: ai, SKILL_EMBEDDINGS: index } } } } as H3Event
  return { event, storage, ai, index }
}

describe('semantic Skill search', () => {
  beforeEach(() => {
    vi.stubGlobal('emitOperationalEvent', vi.fn())
    vi.stubGlobal('createWideEvent', vi.fn(() => ({})))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reuses valid cached vectors and preserves similarity scores', async () => {
    const { event, ai, index } = setup(vector)
    expect(await semanticSkillSearch(event, 'debug crashes')).toEqual([{ ...metadata, score: 0.72 }])
    expect(ai.run).not.toHaveBeenCalled()
    expect(index.query.mock.calls[0]?.[0]).toEqual(vector)
  })

  it('does not reuse a query vector from the old embedding contract', async () => {
    const { event, storage, ai } = setup()
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('debug crashes'))
    const legacyKey = `search:qvec:${[...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')}`
    storage.getItem.mockImplementation(async key => key === legacyKey ? vector : null)
    await semanticSkillSearch(event, 'debug crashes')
    expect(ai.run).toHaveBeenCalledOnce()
  })

  it.each([NaN, Infinity, '0.25', null])('regenerates a cached vector containing %s', async (component) => {
    const invalid = [...vector] as unknown[]
    invalid[10] = component
    const { event, ai, index } = setup(invalid)
    expect(await semanticSkillSearch(event, 'debug crashes')).toEqual([{ ...metadata, score: 0.72 }])
    expect(ai.run).toHaveBeenCalledOnce()
    expect(index.query.mock.calls[0]?.[0]).toEqual(vector)
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it.each([NaN, Infinity, '0.25', null])('falls back when inference returns component %s', async (component) => {
    const invalid = [...vector] as unknown[]
    invalid[10] = component
    const { event, ai, index } = setup()
    ai.run.mockResolvedValue({ data: [invalid] })
    expect(await semanticSkillSearch(event, 'debug crashes')).toBeNull()
    expect(index.query).not.toHaveBeenCalled()
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it('rejects invalid scores while retaining weak finite matches for ranking', async () => {
    const { event, index } = setup(vector)
    index.query.mockResolvedValue({ matches: [NaN, Infinity, 0.12].map(score => ({ id: 'id', metadata, score })) })
    expect(await semanticSkillSearch(event, 'debug crashes')).toEqual([{ ...metadata, score: 0.12 }])
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it('returns unavailable when Vectorize rejects the query', async () => {
    const { event, index } = setup(vector)
    index.query.mockRejectedValue(new Error('Vectorize unavailable'))
    expect(await semanticSkillSearch(event, 'debug crashes')).toBeNull()
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it('returns empty results when Vectorize finds no matches', async () => {
    const { event, index } = setup(vector)
    index.query.mockResolvedValue({ matches: [] })
    expect(await semanticSkillSearch(event, 'debug crashes')).toEqual([])
    expect(emitOperationalEvent).not.toHaveBeenCalled()
  })

  it('returns unavailable when every returned score is invalid', async () => {
    const { event, index } = setup(vector)
    index.query.mockResolvedValue({ matches: [{ id: 'id', metadata, score: NaN }] })
    expect(await semanticSkillSearch(event, 'debug crashes')).toBeNull()
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it('falls back when inference fails', async () => {
    const { event, ai, index } = setup()
    ai.run.mockRejectedValue(new Error('AI unavailable'))
    expect(await semanticSkillSearch(event, 'debug crashes')).toBeNull()
    expect(index.query).not.toHaveBeenCalled()
    expect(emitOperationalEvent).toHaveBeenCalled()
  })

  it('continues inference when the cache read fails', async () => {
    const { event, storage } = setup()
    storage.getItem.mockRejectedValue(new Error('KV unavailable'))
    expect(await semanticSkillSearch(event, 'debug crashes')).toEqual([{ ...metadata, score: 0.72 }])
    expect(emitOperationalEvent).toHaveBeenCalled()
  })
})
