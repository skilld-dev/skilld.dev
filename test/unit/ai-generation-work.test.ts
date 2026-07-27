import type { AbstractnessPayload } from '../../layers/registry/server/utils/ai-generation-work'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ABSTRACTNESS_MODEL,
  ABSTRACTNESS_PROMPT_VERSION,
  abstractnessResponseText,
  buildAbstractnessUserPrompt,
  parseAbstractnessPayload,
  persistAbstractness,
  runtimeGenerationLimits,
  selectMissingGeneratedSkills,
} from '../../layers/registry/server/utils/ai-generation-work'
import {
  ABSTRACTNESS_RESPONSE_FORMAT,
  ABSTRACTNESS_SYSTEM_PROMPT,
} from '../../layers/registry/server/utils/ai-prompts'

describe('ai generation work', () => {
  let sqlite: Database.Database
  let db: D1Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE repos (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        broken_since INTEGER,
        PRIMARY KEY (owner, repo)
      );
      CREATE TABLE skills (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        current_sha TEXT,
        rendered_raw TEXT,
        rendered_status TEXT,
        seo_indexable INTEGER,
        installs INTEGER,
        display_name TEXT,
        is_abstract INTEGER,
        target_package TEXT,
        abstractness_category TEXT,
        PRIMARY KEY (owner, repo, name)
      );
      CREATE TABLE skill_generated (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        sha TEXT NOT NULL,
        payload TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (owner, repo, name, kind)
      );
      INSERT INTO repos VALUES ('acme', 'skills', NULL);
      INSERT INTO skills (
        owner, repo, name, current_sha, rendered_raw, rendered_status,
        seo_indexable, installs, display_name
      ) VALUES
        ('acme', 'skills', 'paused-only', 'sha-paused', '# Paused', 'ok', 1, 30, 'Paused'),
        ('acme', 'skills', 'stale-classifier', 'sha-stale', '# Stale', 'ok', 1, 25, 'Stale'),
        ('acme', 'skills', 'needs-embedding', 'sha-embed', '# Embed', 'ok', 1, 20, 'Embed'),
        ('acme', 'skills', 'needs-abstractness', 'sha-abstract', '# Abstract', 'ok', 1, 10, 'Abstract');
      INSERT INTO skill_generated VALUES
        ('acme', 'skills', 'paused-only', 'embedding', 'sha-paused', '{}', '2026-07-27T00:00:00.000Z'),
        ('acme', 'skills', 'paused-only', 'abstractness', 'sha-paused', '{"kind":"abstract","package":null,"category":"planning","model":"@cf/meta/llama-3.2-1b-instruct","promptVersion":"2026-07-27-v2"}', '2026-07-27T00:00:00.000Z'),
        ('acme', 'skills', 'stale-classifier', 'embedding', 'sha-stale', '{}', '2026-07-27T00:00:00.000Z'),
        ('acme', 'skills', 'stale-classifier', 'abstractness', 'sha-stale', '{"kind":"abstract","package":null,"category":"planning"}', '2026-07-27T00:00:00.000Z'),
        ('acme', 'skills', 'needs-embedding', 'abstractness', 'sha-embed', '{}', '2026-07-27T00:00:00.000Z'),
        ('acme', 'skills', 'needs-abstractness', 'embedding', 'sha-abstract', '{}', '2026-07-27T00:00:00.000Z');
    `)
    db = wrapSqlite(sqlite)
  })

  afterEach(() => sqlite.close())

  it('does not select current runtime kinds because paused batch kinds are missing', async () => {
    const embeddings = await selectMissingGeneratedSkills(db, 'embedding', 50)
    const abstractness = await selectMissingGeneratedSkills(db, 'abstractness', 50)

    expect(embeddings.map(skill => skill.name)).toEqual(['needs-embedding'])
    expect(abstractness.map(skill => skill.name)).toEqual([
      'paused-only',
      'stale-classifier',
      'needs-embedding',
      'needs-abstractness',
    ])
  })

  it('keeps worst-case runtime generation below the D1 invocation query limit', () => {
    const limits = runtimeGenerationLimits()

    expect(limits.embedding).toBeGreaterThan(0)
    expect(limits.embedding).toBeLessThanOrEqual(20)
    expect(limits.abstractness).toBeGreaterThan(0)
    expect(
      limits.embedding * limits.embeddingQueriesPerItem
      + limits.abstractness * limits.abstractnessQueriesPerItem
      + limits.reservedQueries,
    ).toBeLessThanOrEqual(limits.invocationQueryLimit)
  })

  it('requests constrained classifier JSON and accepts object responses', () => {
    expect(ABSTRACTNESS_MODEL).toBe('@cf/meta/llama-3.1-8b-instruct-fast')
    expect(ABSTRACTNESS_RESPONSE_FORMAT).toMatchObject({
      type: 'json_schema',
      json_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'package', 'category'],
        properties: {
          kind: { enum: ['abstract', 'package-specific'] },
          category: { enum: expect.arrayContaining(['testing', 'documentation']) },
        },
      },
    })
    expect(abstractnessResponseText({
      response: {
        kind: 'abstract',
        package: null,
        category: 'testing',
      },
    })).toBe('{"kind":"abstract","package":null,"category":"testing"}')
  })

  it('parses classifier output into a precise payload', () => {
    expect(parseAbstractnessPayload({
      kind: 'package-specific',
      package: 'nuxt',
      category: 'framework',
    })).toEqual({
      _tag: 'ok',
      value: {
        kind: 'package-specific',
        package: 'nuxt',
        category: 'framework',
      },
    })
    expect(parseAbstractnessPayload({
      kind: 'package-specific',
      package: null,
      category: 'documentation',
    })).toEqual({ _tag: 'error', reason: 'invalid_package' })
    expect(parseAbstractnessPayload({
      kind: 'abstract',
      package: null,
      category: 'content-writing',
    })).toEqual({ _tag: 'error', reason: 'invalid_category' })
  })

  it('supplies repository identity and a strict transferability contract', () => {
    const prompt = buildAbstractnessUserPrompt({
      owner: 'getsentry',
      repo: 'sentry',
      name: 'sred-work-summary',
      currentSha: 'sha',
      renderedRaw: '# Internal SRED commands',
      displayName: 'SRED work summary',
    })

    expect(prompt).toContain('Identity: getsentry/sentry/sred-work-summary')
    expect(prompt).toContain('# Internal SRED commands')
    expect(ABSTRACTNESS_SYSTEM_PROMPT).toContain('transfer unchanged across unrelated repositories')
    expect(ABSTRACTNESS_SYSTEM_PROMPT).toContain('repo-local work summaries')
    expect(ABSTRACTNESS_SYSTEM_PROMPT).toContain('Markdown conversion')
    expect(ABSTRACTNESS_SYSTEM_PROMPT).toContain('"documentation"')
  })

  it('writes source and denormalized abstractness atomically for the current SHA', async () => {
    const payload: AbstractnessPayload = {
      kind: 'abstract',
      package: null,
      category: 'planning',
    }

    const result = await persistAbstractness(db, {
      owner: 'acme',
      repo: 'skills',
      name: 'needs-abstractness',
      currentSha: 'sha-abstract',
    }, payload, 1_785_107_600)

    expect(result).toEqual({ _tag: 'written' })
    expect(sqlite.prepare(
      `SELECT sha, payload FROM skill_generated
       WHERE owner = 'acme' AND repo = 'skills'
         AND name = 'needs-abstractness' AND kind = 'abstractness'`,
    ).get()).toEqual({
      sha: 'sha-abstract',
      payload: JSON.stringify({
        ...payload,
        model: ABSTRACTNESS_MODEL,
        promptVersion: ABSTRACTNESS_PROMPT_VERSION,
      }),
    })
    expect(sqlite.prepare(
      `SELECT is_abstract, target_package, abstractness_category
       FROM skills WHERE owner = 'acme' AND repo = 'skills' AND name = 'needs-abstractness'`,
    ).get()).toEqual({
      is_abstract: 1,
      target_package: null,
      abstractness_category: 'planning',
    })
  })

  it('accepts D1 change counts amplified by skills FTS triggers', async () => {
    const statement = {
      bind: () => statement,
    } as unknown as D1PreparedStatement
    const triggeredDb = {
      prepare: () => statement,
      batch: async () => [
        { meta: { changes: 1 } },
        { meta: { changes: 5 } },
      ],
    } as unknown as D1Database

    const result = await persistAbstractness(triggeredDb, {
      owner: 'acme',
      repo: 'skills',
      name: 'needs-abstractness',
      currentSha: 'sha-abstract',
    }, {
      kind: 'abstract',
      package: null,
      category: 'planning',
    }, 1_785_107_600)

    expect(result).toEqual({ _tag: 'written' })
  })

  it('does not persist a stale classifier result after the source SHA changes', async () => {
    sqlite.prepare(
      `UPDATE skills SET current_sha = 'sha-new'
       WHERE owner = 'acme' AND repo = 'skills' AND name = 'needs-abstractness'`,
    ).run()

    const result = await persistAbstractness(db, {
      owner: 'acme',
      repo: 'skills',
      name: 'needs-abstractness',
      currentSha: 'sha-abstract',
    }, {
      kind: 'abstract',
      package: null,
      category: 'planning',
    }, 1_785_107_600)

    expect(result).toEqual({ _tag: 'source_changed' })
    expect(sqlite.prepare(
      `SELECT count(*) FROM skill_generated
       WHERE owner = 'acme' AND repo = 'skills'
         AND name = 'needs-abstractness' AND kind = 'abstractness'`,
    ).pluck().get()).toBe(0)
  })
})

function wrapSqlite(sqlite: Database.Database): D1Database {
  const bindings = (params: unknown[]) =>
    Object.fromEntries(params.map((value, index) => [String(index + 1), value]))
  const prepare = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...bound: unknown[]) => prepare(sql, bound),
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(bindings(params)) as T[],
    }),
    run: async () => {
      const result = sqlite.prepare(sql).run(bindings(params))
      return { meta: { changes: result.changes } }
    },
  }) as D1PreparedStatement

  return {
    prepare,
    batch: async (statements: D1PreparedStatement[]) =>
      await Promise.all(statements.map(statement => statement.run())),
  } as D1Database
}
