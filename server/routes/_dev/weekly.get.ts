/**
 * Browser preview for the weekly email. Dev only; 404 in production.
 *
 * `/_dev/weekly` lists the scenarios, `/_dev/weekly?scenario=full` renders one
 * as the mail client would see it, and `&format=text` shows the plain-text
 * half. The point is to look at the template against awkward input (no likes,
 * no description, a 300 character quote, a one-line week) before it goes to
 * anyone, because a mail client is the one surface we cannot hotfix.
 */

import type { WeeklyRenderInput } from '#layers/identity/server/utils/weekly-template'
import { renderWeekly } from '#layers/identity/server/utils/weekly-template'

const WINDOW_END = 1_755_648_000 // 2026-08-20T00:00:00Z, fixed so previews are stable
const WINDOW_START = WINDOW_END - 7 * 86_400

function base(): Omit<WeeklyRenderInput, 'likedChanges' | 'likedOverflow' | 'trending'> {
  return {
    login: 'harlan-zw',
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    siteUrl: 'https://skilld.dev',
    unsubscribeUrl: 'https://skilld.dev/unsubscribe?token=preview',
    settingsUrl: 'https://skilld.dev/me',
  }
}

const SCENARIOS: Record<string, () => WeeklyRenderInput> = {
  'full': () => ({
    ...base(),
    likedChanges: [
      {
        owner: 'antfu',
        repo: 'skills',
        name: 'vitest',
        slug: 'vitest',
        description: 'Testing conventions for Vitest projects.',
        changeCount: 3,
        changedAt: WINDOW_END - 2 * 86_400,
        commitMessages: [
          'Cover browser mode and the new projects config',
          'fix: watch mode no longer reruns the whole suite',
          'chore: bump',
          'chore: bump',
        ],
      },
      {
        owner: 'mattpocock',
        repo: 'skills',
        name: 'tdd',
        slug: 'tdd',
        description: 'Drive a change from a failing test, one behaviour at a time.',
        changeCount: 1,
        changedAt: WINDOW_END - 86_400,
        commitMessages: [],
      },
      {
        owner: 'addyosmani',
        repo: 'web-quality-skills',
        name: 'core-web-vitals',
        slug: 'core-web-vitals',
        description: 'Diagnose LCP, INP, and CLS against a real trace instead of a score.',
        changeCount: 7,
        changedAt: WINDOW_END - 5 * 86_400,
        commitMessages: [
          'Replace the FID section with INP',
          'Add the field-data caveat to the LCP section',
          'Link the trace walkthrough',
          'Fix a broken anchor',
        ],
      },
      {
        owner: 'pbakaus',
        repo: 'impeccable',
        name: 'impeccable',
        slug: 'impeccable',
        description: null,
        changeCount: 2,
        changedAt: WINDOW_END - 6 * 86_400,
        commitMessages: ['Tighten the spacing rules', 'Drop the shadow guidance'],
      },
      {
        owner: 'ibelick',
        repo: 'ui-skills',
        name: 'fixing-accessibility',
        slug: 'fixing-accessibility',
        description: 'Find and fix the accessibility defects a linter cannot see.',
        changeCount: 1,
        changedAt: WINDOW_END - 3600,
        commitMessages: ['Add focus-visible guidance'],
      },
    ],
    likedOverflow: 3,
    trending: [
      {
        owner: 'garrytan',
        repo: 'gstack',
        slug: 'ship',
        canonicalName: 'ship',
        description: 'Take a change from branch to merged without babysitting it.',
        stars: 12_400,
        reason: { _tag: 'named', authorCount: 4, mentionCount: 9 },
        evidence: {
          url: 'https://x.com/garrytan/status/1',
          authorHandle: 'garrytan',
          text: 'the ship skill has replaced about four of my aliases, it just does the whole branch to merge dance',
          platform: 'x',
        },
      },
      {
        owner: 'dimillian',
        repo: 'skills',
        slug: 'swiftui-liquid-glass',
        canonicalName: 'swiftui-liquid-glass',
        description: 'Build the new material effects without fighting the layout system.',
        stars: 865,
        reason: { _tag: 'named-and-stars', authorCount: 2, mentionCount: 3, gain: 412, day: WINDOW_END - 2 * 86_400 },
        evidence: {
          url: 'https://bsky.app/profile/dimillian/post/1',
          authorHandle: 'dimillian.bsky.social',
          text: 'wrote up everything I learned shipping liquid glass in a skill',
          platform: 'bsky',
        },
      },
      {
        owner: 'kepano',
        repo: 'obsidian-skills',
        slug: 'obsidian-bases',
        canonicalName: 'obsidian-bases',
        description: 'Model a vault as a database without leaving markdown.',
        stars: 3200,
        reason: { _tag: 'stars', gain: 1180, day: WINDOW_END - 4 * 86_400 },
        evidence: null,
      },
      {
        owner: 'hyf0',
        repo: 'vue-skills',
        slug: 'vue-debug-guides',
        canonicalName: 'vue-debug-guides',
        description: null,
        stars: 210,
        reason: { _tag: 'named', authorCount: 1, mentionCount: 1 },
        evidence: null,
      },
      {
        owner: 'brianlovin',
        repo: 'claude-config',
        slug: 'deslop',
        canonicalName: 'deslop',
        description: 'Strip the tells that make generated prose read as generated.',
        stars: 46_712,
        reason: { _tag: 'popular', stars: 46_712 },
        evidence: null,
      },
    ],
  }),

  'trending-only': () => ({
    ...base(),
    likedChanges: [],
    likedOverflow: 0,
    trending: SCENARIOS.full!().trending,
  }),

  'liked-only': () => ({
    ...base(),
    likedChanges: SCENARIOS.full!().likedChanges.slice(0, 2),
    likedOverflow: 0,
    trending: [],
  }),

  'minimal': () => ({
    ...base(),
    likedChanges: [{
      owner: 'antfu',
      repo: 'skills',
      name: 'vite',
      slug: 'vite',
      description: null,
      changeCount: 1,
      changedAt: WINDOW_END - 1200,
      commitMessages: [],
    }],
    likedOverflow: 0,
    trending: [{
      owner: 'onmax',
      repo: 'nuxt-skills',
      slug: 'nuxt-seo',
      canonicalName: 'nuxt-seo',
      description: null,
      stars: null,
      reason: { _tag: 'named', authorCount: 1, mentionCount: 1 },
      evidence: null,
    }],
  }),

  // Nothing this week. The template still has to say something useful.
  'empty': () => ({ ...base(), likedChanges: [], likedOverflow: 0, trending: [] }),

  // Every string at the length that breaks layouts.
  'overflow': () => ({
    ...base(),
    login: 'a-really-quite-long-github-login',
    likedChanges: [{
      owner: 'some-organisation-with-a-long-name',
      repo: 'agent-skills-for-everything-monorepo',
      name: 'exhaustively-named-skill-for-refactoring',
      slug: 'exhaustively-named-skill-for-refactoring',
      description: 'A description that keeps going well past the point where any reasonable person would have stopped writing it, so the row has to wrap at least three times and the avatar must stay pinned to the top of the cell rather than drifting to the middle.',
      changeCount: 41,
      changedAt: WINDOW_END - 86_400,
      commitMessages: [
        'refactor: rename every occurrence of the old identifier across the workspace and update the generated documentation to match',
        'chore: bump',
        'chore: bump',
        'test: cover the renamed export in the integration suite as well as the unit suite',
      ],
    }],
    likedOverflow: 12,
    trending: [{
      owner: 'another-organisation',
      repo: 'skills',
      slug: 'a-skill-with-an-unusually-long-canonical-name',
      canonicalName: 'a-skill-with-an-unusually-long-canonical-name',
      description: 'Unicode and entities: quotes "like this", ampersands & angle brackets <div>, emoji dashes, and accented names such as Renée Müller.',
      stars: 1_284_000,
      reason: { _tag: 'named-and-stars', authorCount: 17, mentionCount: 42, gain: 9_814, day: WINDOW_END - 3 * 86_400 },
      evidence: {
        url: 'https://x.com/someone/status/2',
        authorHandle: 'a_very_long_handle_indeed',
        text: 'This post is deliberately far longer than any sane person would write in a single social post, because the template truncates at one hundred and eighty characters and the cut has to land somewhere that still reads as a sentence rather than mid-word gibberish.',
        platform: 'x',
      },
    }],
  }),
}

/**
 * Today's real trending rows, read from production.
 *
 * Fixtures prove the template survives awkward input; they cannot prove the
 * email is worth opening. This reads the same endpoint the public board reads,
 * so the preview shows the rows that would actually go out this week.
 */
async function liveScenario(): Promise<WeeklyRenderInput> {
  const feed = await $fetch<{
    namedSkills: Array<{
      owner: string
      repo: string
      slug: string
      canonicalName: string
      description: string | null
      stars: number | null
      attribution: 'social' | 'github' | 'both'
      authorCount: number
      mentionCount: number
      starGain: number | null
      starGainDay: number | null
      evidence: { url: string, authorHandle: string, text: string, platform: 'x' | 'bsky' } | null
    }>
  }>('https://skilld.dev/api/feed/trending', { query: { limit: 5, window: 24 * 7 } })

  return {
    ...base(),
    likedChanges: SCENARIOS.full!().likedChanges.slice(0, 3),
    likedOverflow: 0,
    trending: feed.namedSkills.slice(0, 5).map(skill => ({
      owner: skill.owner,
      repo: skill.repo,
      slug: skill.slug,
      canonicalName: skill.canonicalName,
      description: skill.description,
      stars: skill.stars,
      reason: skill.attribution === 'both' && skill.starGain !== null && skill.starGainDay !== null
        ? { _tag: 'named-and-stars' as const, authorCount: skill.authorCount, mentionCount: skill.mentionCount, gain: skill.starGain, day: skill.starGainDay }
        : skill.attribution === 'github' && skill.starGain !== null && skill.starGainDay !== null
          ? { _tag: 'stars' as const, gain: skill.starGain, day: skill.starGainDay }
          : { _tag: 'named' as const, authorCount: skill.authorCount, mentionCount: skill.mentionCount },
      evidence: skill.evidence,
    })),
  }
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production')
    throw createError({ statusCode: 404 })

  const query = getQuery(event)
  const name = typeof query.scenario === 'string' ? query.scenario : ''
  const scenario = name === 'live' ? liveScenario : SCENARIOS[name]

  if (!scenario) {
    setHeader(event, 'content-type', 'text/html; charset=utf-8')
    return `<!doctype html><meta charset="utf-8"><title>weekly email preview</title>
<body style="font-family:ui-monospace,monospace;background:#f5f4f2;color:#1c1917;padding:40px;line-height:2;">
<h1 style="font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#a8a29e;">weekly email preview</h1>
${['live', ...Object.keys(SCENARIOS)].map(key =>
  `<div><a href="?scenario=${key}" style="color:#e11d48;">${key}</a> &nbsp; <a href="?scenario=${key}&format=text" style="color:#78716c;font-size:12px;">text</a></div>`).join('')}
</body>`
  }

  const rendered = renderWeekly(await scenario())
  if (query.format === 'text') {
    setHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return `Subject: ${rendered.subject}\n\n${rendered.text}`
  }
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return rendered.html
})
