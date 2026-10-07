import type { DemoMakes } from '#shared/demo-groups'
import { z } from 'zod'
import { DEMO_MAKES } from '#shared/demo-groups'
import { demoPagePath, DEMOS_PATH, MIN_INDEXABLE_DEMOS } from '#shared/demo-pages'
import { runCheckFlagKey } from '#shared/run-check-flags'
import { repoSkillPath } from '#shared/skill-routes'
import manifest from '../data/skill-demos.json'

/**
 * Demos: one recorded run of a Skill each (GLOSSARY "demo").
 *
 * `scripts/record-skill-demo.ts` runs a fixed prompt through an Agent with the
 * Skill loaded, uploads the screenshots (or a video and its poster) to the
 * `skilld-demo-media` R2 bucket, keeps the output page in `server/demos/`, and
 * writes the entry below. Merging the pull request that adds an entry is the
 * human approval: the media sits unreferenced until then.
 *
 * Media lives at `DEMO_MEDIA_ORIGIN`, the bucket's custom domain, under
 * content-hashed names, so a URL never changes what it serves.
 *
 * A demo marked `skillPageOnly` shows on its Skill page and nowhere else:
 * not on `/skills/demos`, the homepage, a demo page of its own, or the
 * `demos` sitemap.
 *
 * Cull path: delete the entry, its `server/demos/<owner>/<repo>/<name>/`
 * folder, and the bucket's `demos/<owner>/<repo>/<name>/` prefix.
 */

const shotSchema = z.object({
  /** Content-hashed file name under the bucket's `demos/<owner>/<repo>/<name>/`. A raster image only: an SVG can carry script. */
  file: z.string().regex(/^[\w-]+\.(?:png|jpg)$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']),
  /**
   * The first screen of a shot taller than one screen, at the shot's width and
   * the viewport's height. The Skill page paints it first and loads the full
   * page only when someone scrolls the window.
   */
  poster: z.object({
    file: z.string().regex(/^[\w-]+\.jpg$/),
    height: z.number().int().positive(),
  }).optional(),
})

const videoSchema = z.object({
  /** Content-hashed H.264 MP4 under the bucket's `demos/<owner>/<repo>/<name>/`, re-encoded small for the web. */
  file: z.string().regex(/^[\w-]+\.mp4$/),
  /** A JPG frame shown before the video plays. */
  poster: z.string().regex(/^[\w-]+\.jpg$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive(),
})

const demoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  name: z.string().min(1),
  /** The Skill author's GitHub profile name when recorded. Provenance for cards (VISION principle 1). */
  authorName: z.string().min(1).nullable().optional(),
  /** The SKILL.md in the author's Repository. */
  sourceUrl: z.string().url().optional(),
  /** What the Skill made, which groups the demo on `/skills/demos`. */
  makes: z.enum(DEMO_MAKES),
  /** The exact text the Agent received after loading the Skill. */
  prompt: z.string().min(1),
  /** What the folder held before the Agent started, when the recording seeded one. */
  setup: z.string().min(1).optional(),
  agent: z.string().min(1),
  agentVersion: z.string().min(1),
  model: z.string().min(1),
  /** The Skill's source commit when the demo was recorded. */
  skillCommit: z.string().regex(/^[0-9a-f]{40}$/),
  recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Lower comes first on the homepage. Unpinned demos follow, newest first. */
  pin: z.number().int().positive().optional(),
  /** Shown on the Skill page alone: left off the board, the homepage, and the `demos` sitemap, with no demo page. */
  skillPageOnly: z.literal(true).optional(),
  /** File name inside `server/demos/<owner>/<repo>/<name>/`, served sandboxed as the live demo. */
  outputFile: z.string().regex(/^[\w-]+\.html$/).optional(),
  video: videoSchema.optional(),
  shots: z.array(shotSchema).min(1),
}).refine(demo => demo.outputFile !== undefined || demo.video !== undefined, {
  message: 'A demo needs an output page or a video.',
}).refine(demo => !(demo.skillPageOnly && demo.pin), {
  message: 'A Skill page only demo takes no pin: a pin orders the homepage, which leaves it out.',
})

export type SkillDemoRecord = z.infer<typeof demoSchema>

const SKILL_DEMOS: readonly SkillDemoRecord[] = z.object({ demos: z.array(demoSchema) }).parse(manifest).demos

function sameSkill(demo: SkillDemoRecord, owner: string, repo: string, name: string): boolean {
  return demo.owner.toLowerCase() === owner.toLowerCase()
    && demo.repo.toLowerCase() === repo.toLowerCase()
    && demo.name.toLowerCase() === name.toLowerCase()
}

export function findSkillDemo(owner: string, repo: string, name: string, demos: readonly SkillDemoRecord[] = SKILL_DEMOS): SkillDemoRecord | null {
  return demos.find(demo => sameSkill(demo, owner, repo, name)) ?? null
}

export function listSkillDemos(demos: readonly SkillDemoRecord[] = SKILL_DEMOS): readonly SkillDemoRecord[] {
  return [...demos].sort((a, b) =>
    (a.pin ?? Number.POSITIVE_INFINITY) - (b.pin ?? Number.POSITIVE_INFINITY)
    || b.recordedAt.localeCompare(a.recordedAt))
}

/**
 * The demos the board, the homepage, and the demo pages show. A Skill page
 * only demo stays out. So does a demo whose Skill holds a run check flag,
 * until a check passes: a visitor who watches it would copy a run command
 * that fails.
 */
export function listShownSkillDemos(flagged: ReadonlySet<string>, demos: readonly SkillDemoRecord[] = SKILL_DEMOS): readonly SkillDemoRecord[] {
  return listSkillDemos(demos).filter(demo => !demo.skillPageOnly && !flagged.has(runCheckFlagKey(demo.owner, demo.repo, demo.name)))
}

export interface DemoSitemapEntry {
  loc: string
  lastmod: string
}

/**
 * `/skills/demos` and each shown demo's page. Empty below
 * `MIN_INDEXABLE_DEMOS`, where those pages answer noindex.
 */
export function listDemoSitemapEntries(flagged: ReadonlySet<string>, demos: readonly SkillDemoRecord[] = SKILL_DEMOS): DemoSitemapEntry[] {
  const shown = listShownSkillDemos(flagged, demos)
  if (shown.length < MIN_INDEXABLE_DEMOS)
    return []
  const newest = shown.map(demo => demo.recordedAt).sort().at(-1) as string
  return [
    { loc: DEMOS_PATH, lastmod: newest },
    ...shown.map(demo => ({ loc: demoPagePath(demo), lastmod: demo.recordedAt })),
  ]
}

/** The `skilld-demo-media` bucket's custom domain. */
export const DEMO_MEDIA_ORIGIN = 'https://media.skilld.dev'

function demoPath(demo: SkillDemoRecord): string {
  return `/demos/${demo.owner}/${demo.repo}/${demo.name}`
}

export interface SkillDemoShot {
  src: string
  width: number
  height: number
  alt: string
  viewport: 'desktop' | 'mobile'
  /** The first screen, when the shot runs longer than one. */
  poster: { src: string, width: number, height: number } | null
}

export interface SkillDemoVideo {
  src: string
  poster: string
  width: number
  height: number
  durationSeconds: number
}

/** What the Skill page and the homepage render for one demo. */
export interface SkillDemoView {
  owner: string
  repo: string
  name: string
  skillPath: string
  makes: DemoMakes
  authorName: string | null
  sourceUrl: string | null
  prompt: string
  setup: string | null
  agent: string
  model: string
  skillCommit: string
  recordedAt: string
  /** True when the Skill moved past the commit the demo recorded. */
  outdated: boolean
  /** Shown on the Skill page alone, so the Demo panel links to no demo page. */
  skillPageOnly: boolean
  /** The sandboxed output page, when the demo kept one. */
  liveUrl: string | null
  video: SkillDemoVideo | null
  shots: SkillDemoShot[]
}

/** `currentCommit` is the Skill's source commit now, when known. Unknown never marks a demo outdated. */
export function presentSkillDemo(demo: SkillDemoRecord, currentCommit: string | null, mediaOrigin: string = DEMO_MEDIA_ORIGIN): SkillDemoView {
  const path = demoPath(demo)
  const media = `${mediaOrigin}${path}`
  return {
    owner: demo.owner,
    repo: demo.repo,
    name: demo.name,
    skillPath: repoSkillPath(demo.owner, demo.repo, demo.name),
    makes: demo.makes,
    authorName: demo.authorName ?? null,
    sourceUrl: demo.sourceUrl ?? null,
    prompt: demo.prompt,
    setup: demo.setup ?? null,
    agent: demo.agent,
    model: demo.model,
    skillCommit: demo.skillCommit,
    recordedAt: demo.recordedAt,
    outdated: currentCommit !== null && currentCommit !== demo.skillCommit,
    skillPageOnly: demo.skillPageOnly ?? false,
    liveUrl: demo.outputFile ? `${path}/live` : null,
    video: demo.video
      ? {
          src: `${media}/${demo.video.file}`,
          poster: `${media}/${demo.video.poster}`,
          width: demo.video.width,
          height: demo.video.height,
          durationSeconds: demo.video.durationSeconds,
        }
      : null,
    shots: demo.shots.map(shot => ({
      src: `${media}/${shot.file}`,
      width: shot.width,
      height: shot.height,
      alt: shot.alt,
      viewport: shot.viewport,
      poster: shot.poster ? { src: `${media}/${shot.poster.file}`, width: shot.width, height: shot.poster.height } : null,
    })),
  }
}

/** The key of a demo's output page in the `skill-demos` server assets, or null for a video-only demo. */
export function skillDemoOutputKey(demo: SkillDemoRecord): string | null {
  return demo.outputFile ? `${demo.owner}/${demo.repo}/${demo.name}/${demo.outputFile}` : null
}
