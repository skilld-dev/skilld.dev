import type { SkillCardSkill } from '~/types/skill-card'
import { AGENT_LOGOS } from './agent-logos'

/**
 * The fields the homepage reads from `/api/skill-demos`. Declared here, not
 * imported from the registry layer, so the homepage stays deletion-testable.
 */
export interface HomeDemoItem {
  owner: string
  repo: string
  name: string
  skillPath: string
  /** The Skill author, and the SKILL.md in their Repository (VISION principle 1). */
  authorName: string | null
  sourceUrl: string | null
  prompt: string
  /** How the demo was recorded (GLOSSARY "demo"). The endpoint already sends these. */
  agent: string
  model: string
  /** `YYYY-MM-DD`. */
  recordedAt: string
  shots: { src: string, width: number, height: number, alt: string, viewport: 'desktop' | 'mobile' }[]
  /** A Skill whose output is a film. The poster is a JPG frame; `src` is a muted H.264 MP4. */
  video: HomeDemoVideo | null
}

export interface HomeDemoVideo {
  src: string
  poster: string
  width: number
  height: number
  durationSeconds: number
}

export type HomeDemoShot = HomeDemoItem['shots'][number]

/** Fewer than this reads as a broken feature, as with trending. */
export const HOME_DEMOS_MIN = 3
export const HOME_DEMOS_MAX = 6

/**
 * Below this width a demo shows its phone shot, when it has one. Stylesheets
 * repeat the value as `max-width: 39.99rem`, the `sm` breakpoint.
 */
export const DEMO_PHONE_MEDIA = '(max-width: 39.99rem)'

export function demoKey(demo: HomeDemoItem): string {
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

/** The Skill as `SkillCard` reads it, so a demo names its author the way every Skill embed does. */
export function demoCardSkill(demo: HomeDemoItem): SkillCardSkill {
  return {
    owner: demo.owner,
    repo: demo.repo,
    name: demo.name,
    registryPath: demo.skillPath,
    authorName: demo.authorName,
    skillFileUrl: demo.sourceUrl,
  }
}

/** `claude-opus-5-5` reads as `Opus 5.5`. A model id outside that shape stays as it is. */
export function demoModelLabel(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model)
  if (!match)
    return model
  const [, family = '', major, minor] = match
  const version = minor ? `${major}.${minor}` : major
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version}`
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export interface DemoRecordingView {
  /** The Agent's logo, or a generic one for an Agent the site has no logo for. */
  icon: string
  /** `Opus 5.5`. */
  model: string
  /** `6 Oct`. */
  day: string
  /** The COPY.md provenance line without the commit, for screen readers and the title. */
  sentence: string
}

/** How a demo was recorded, short enough for a card. */
export function demoRecording(demo: Pick<HomeDemoItem, 'agent' | 'model' | 'recordedAt'>): DemoRecordingView {
  const date = new Date(`${demo.recordedAt}T00:00:00Z`)
  const icon = AGENT_LOGOS.find(agent => agent.label === demo.agent)?.icon ?? 'i-lucide-bot'
  return {
    icon,
    model: demoModelLabel(demo.model),
    day: SHORT_DATE.format(date),
    sentence: `Agent output, recorded with ${demo.agent} (${demo.model}) on ${LONG_DATE.format(date)}`,
  }
}
