import type { DemoMakes } from '#shared/demo-groups'
import type { DemoEffort } from '#shared/demo-recording'
import type { DemoTokenUsage } from '#shared/demo-usage'
import type { WritingDemo } from '#shared/writing-demo'
import type { SkillCardSkill } from '~/types/skill-card'
import { DEMO_GROUPS } from '#shared/demo-groups'
import { demoAgentIcon, demoRecordingLabel } from '#shared/demo-recording'

/**
 * The fields the homepage reads from `/api/skill-demos`. Declared here, not
 * imported from the registry layer, so the homepage stays deletion-testable.
 */
export interface HomeDemoItem {
  owner: string
  repo: string
  name: string
  skillPath: string
  /** What the Skill made: the demo's group on `/skills/demos`. */
  makes: DemoMakes
  /** The Skill author, and the SKILL.md in their Repository (VISION principle 1). */
  authorName: string | null
  sourceUrl: string | null
  prompt: string
  /** How the demo was recorded (GLOSSARY "demo"). The endpoint already sends these. */
  agent: string
  model: string
  effort?: DemoEffort | null
  tokenUsage?: DemoTokenUsage | null
  /** `YYYY-MM-DD`. */
  recordedAt: string
  shots: HomeDemoShot[]
  /** A Skill whose output is a film. The poster is a JPG frame; `src` is a muted H.264 MP4. */
  /** The sandboxed output page of a page demo; null for a film. */
  liveUrl: string | null
  video: HomeDemoVideo | null
  /** Markdown documents, with the original and the rewrite without a Skill. */
  writing?: WritingDemo | null
}

export interface HomeDemoVideo {
  src: string
  poster: string
  width: number
  height: number
  durationSeconds: number
}

export interface HomeDemoShot {
  src: string
  width: number
  height: number
  alt: string
  viewport: 'desktop' | 'mobile'
  /** The first screen, when the shot runs longer than one. */
  poster: { src: string, width: number, height: number } | null
}

/** Fewer than this reads as a broken feature, as with trending. */
export const HOME_DEMOS_MIN = 3
export const HOME_DEMOS_MAX = 6

/** Compare up to three recordings in one group. Landing pages lead when available. */
export function demoPreviews(demos: readonly HomeDemoItem[]) {
  const groups = DEMO_GROUPS
    .map(group => ({ group, items: demos.filter(demo => demo.makes === group.makes) }))
    .filter(entry => entry.items.length >= 2)
  const entry = groups.find(candidate => candidate.group.makes === 'landing-page') ?? groups[0]
  return entry ? { label: entry.group.label, items: entry.items.slice(0, 3) } : null
}

/** Keep only rendered demos in the homepage payload, plus the full feed count. */
export function homeDemoFeed(feed: { items: HomeDemoItem[] }) {
  return {
    items: feed.items.slice(0, HOME_DEMOS_MAX),
    previews: demoPreviews(feed.items)?.items ?? [],
    total: feed.items.length,
  }
}

/**
 * Below this width a demo shows its phone shot, when it has one. Stylesheets
 * repeat the value as `max-width: 39.99rem`, the `sm` breakpoint.
 */
export const DEMO_PHONE_MEDIA = '(max-width: 39.99rem)'

export function demoKey(demo: Pick<HomeDemoItem, 'owner' | 'repo' | 'name'>): string {
  return `${demo.owner}/${demo.repo}/${demo.name}`
}

/** The Demo panel on the Skill page. */
export function demoHref(demo: HomeDemoItem): string {
  return `${demo.skillPath}#demo`
}

/** The shot for wide screens: the desktop page, else whatever was recorded. */
export function demoDesktopShot(demo: HomeDemoItem): HomeDemoShot | undefined {
  return demo.shots.find(shot => shot.viewport === 'desktop') ?? demo.shots[0]
}

/** The shot for phones, when the recording has one besides the desktop shot. */
export function demoPhoneShot(demo: HomeDemoItem): HomeDemoShot | undefined {
  const desktop = demoDesktopShot(demo)
  return demo.shots.find(shot => shot.viewport === 'mobile' && shot !== desktop)
}

/**
 * The frame turns to a phone's shape only for a phone shot. A video keeps its
 * own shape on every screen.
 */
export function demoHasPhoneFrame(demo: HomeDemoItem): boolean {
  return !demo.video && demoPhoneShot(demo) !== undefined
}

/** One phone screen, 390 by 844, with room for a browser bar that rounds it up. */
const PHONE_SCREEN_RATIO = 844 / 390 * 1.15

/**
 * A phone page no longer than one screen shows whole, so a toast at the
 * bottom of the screen stays in view. A longer page shows its top in the
 * take's own phone frame, and this returns undefined.
 */
export function demoPhoneRatio(demo: HomeDemoItem): string | undefined {
  const shot = demoHasPhoneFrame(demo) ? demoPhoneShot(demo) : undefined
  if (!shot || shot.height / shot.width > PHONE_SCREEN_RATIO)
    return undefined
  return `${shot.width} / ${shot.height}`
}

/** `14` reads as `0:14`, `75` as `1:15`. */
export function formatDemoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** How many screens of its own viewport the page runs to, at least one. */
export function demoScreens(shot: HomeDemoShot): number {
  const screenHeight = shot.viewport === 'mobile' ? shot.width * 844 / 390 : shot.width * 10 / 16
  return Math.max(1, Math.round(shot.height / screenHeight))
}

export interface DemoPicture {
  src: string
  width: number
  height: number
}

/**
 * The picture a demo's social card shows, on its demo page and its Skill
 * page: a film's poster frame, or the first screen of the desktop page. A long
 * page never serves whole, since a 6000px shot would shrink to a strip.
 * Undefined when the demo has neither; the page keeps its text card then.
 */
export function demoSocialPicture(demo: Pick<HomeDemoItem, 'video' | 'shots'>): DemoPicture | undefined {
  if (demo.video)
    return { src: demo.video.poster, width: demo.video.width, height: demo.video.height }
  const shot = demo.shots.find(shot => shot.viewport === 'desktop')
  const screen = shot?.poster ?? (shot && demoScreens(shot) === 1 ? shot : undefined)
  return screen && { src: screen.src, width: screen.width, height: screen.height }
}

/** The Skill as `SkillCard` reads it, so a demo names its author the way every Skill embed does. */
export type DemoIdentity = Pick<HomeDemoItem, 'owner' | 'repo' | 'name' | 'skillPath' | 'authorName' | 'sourceUrl' | 'prompt'>

export function demoCardSkill(demo: DemoIdentity): SkillCardSkill {
  return {
    owner: demo.owner,
    repo: demo.repo,
    name: demo.name,
    registryPath: demo.skillPath,
    authorName: demo.authorName,
    skillFileUrl: demo.sourceUrl,
  }
}

export interface DemoRecordingView {
  /** The Agent's logo, or a generic one for an Agent the site has no logo for. */
  icon: string
  /** `Opus 5.5`. */
  model: string
  /** The COPY.md provenance line, for screen readers and the title. */
  sentence: string
  usage?: { label: string, sentence: string }
}

/** How a demo was recorded, short enough for a card. */
export function demoRecording(demo: Pick<HomeDemoItem, 'agent' | 'model' | 'effort' | 'tokenUsage'>): DemoRecordingView {
  const model = demoRecordingLabel(demo.model, demo.effort ?? null)
  const usage = demo.tokenUsage
  const count = (value: number) => value.toLocaleString('en-US')
  return {
    icon: demoAgentIcon(demo.agent),
    model,
    sentence: `Recorded with ${demo.agent}, ${model}`,
    ...(usage
      ? { usage: {
          label: `${(usage.inputTokens + usage.outputTokens).toLocaleString('en-US', { notation: 'compact', maximumSignificantDigits: 3 })} tokens`,
          sentence: `Input: ${count(usage.inputTokens)}; cached input: ${count(usage.cachedInputTokens)}; output: ${count(usage.outputTokens)}`,
        } }
      : {}),
  }
}
