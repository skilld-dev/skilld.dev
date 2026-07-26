import { describe, expect, it } from 'vitest'
import {
  githubSyncPauseDecision,
} from '../../layers/registry/server/utils/github-sync-control'

describe('github sync pause decision', () => {
  it('opens the circuit on a rejected credential', () => {
    expect(githubSyncPauseDecision({
      now: 1_000,
      owner: 'acme',
      repo: 'skills',
      unauthorized: true,
      rateLimited: false,
    })).toEqual({
      _tag: 'pause',
      pauseUntil: 1_900,
      reason: 'acme/skills: GitHub credential rejected',
    })
  })

  it('pauses near the rate floor and otherwise continues', () => {
    expect(githubSyncPauseDecision({
      now: 1_000,
      owner: 'acme',
      repo: 'skills',
      unauthorized: false,
      rateLimited: false,
      remaining: 199,
      resetAt: 2_000,
    })).toEqual({
      _tag: 'pause',
      pauseUntil: 2_005,
      reason: 'acme/skills: 199 requests remaining',
    })
    expect(githubSyncPauseDecision({
      now: 1_000,
      owner: 'acme',
      repo: 'skills',
      unauthorized: false,
      rateLimited: false,
      remaining: 200,
    })).toEqual({ _tag: 'continue' })
  })
})
