import { z } from 'zod'
import { repoSkillPath } from '#shared/skill-routes'
import manifest from '../data/skill-demos.json'

/**
 * Demos: one recorded run of a Skill each (GLOSSARY "demo").
 *
 * `scripts/record-skill-demo.ts` runs a fixed prompt through an Agent with the
 * Skill loaded, screenshots the output into `public/demos/`, keeps the output
 * page in `server/demos/`, and writes the entry below. Merging the pull request
 * that adds an entry is the human approval: nothing records into production.
 *
 * A video Skill's demo also carries the rendered video and a poster frame.
 *
 * Cull path: delete the entry, its `public/demos/<owner>/<repo>/<name>/`
 * folder, and its `server/demos/<owner>/<repo>/<name>/` folder.
 */

const shotSchema = z.object({
  /** File name inside `public/demos/<owner>/<repo>/<name>/`. A raster image only: an SVG can carry script. */
  file: z.string().regex(/^[\w-]+\.(?:png|jpg)$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']),
})

const videoSchema = z.object({
  /** H.264 MP4 inside `public/demos/<owner>/<repo>/<name>/`, re-encoded small for the web. */
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
  /** File name inside `server/demos/<owner>/<repo>/<name>/`, served sandboxed as the live demo. */
  outputFile: z.string().regex(/^[\w-]+\.html$/).optional(),
  video: videoSchema.optional(),
  shots: z.array(shotSchema).min(1),
}).refine(demo => demo.outputFile !== undefined || demo.video !== undefined, {
  message: 'A demo needs an output page or a video.',
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
  return [...demos].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

function demoBase(demo: SkillDemoRecord): string {
  return `/demos/${demo.owner}/${demo.repo}/${demo.name}`
}

export interface SkillDemoShot {
  src: string
  width: number
  height: number
  alt: string
  viewport: 'desktop' | 'mobile'
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
  /** The sandboxed output page, when the demo kept one. */
  liveUrl: string | null
  video: SkillDemoVideo | null
  shots: SkillDemoShot[]
}

/** `currentCommit` is the Skill's source commit now, when known. Unknown never marks a demo outdated. */
export function presentSkillDemo(demo: SkillDemoRecord, currentCommit: string | null): SkillDemoView {
  const base = demoBase(demo)
  return {
    owner: demo.owner,
    repo: demo.repo,
    name: demo.name,
    skillPath: repoSkillPath(demo.owner, demo.repo, demo.name),
    authorName: demo.authorName ?? null,
    sourceUrl: demo.sourceUrl ?? null,
    prompt: demo.prompt,
    setup: demo.setup ?? null,
    agent: demo.agent,
    model: demo.model,
    skillCommit: demo.skillCommit,
    recordedAt: demo.recordedAt,
    outdated: currentCommit !== null && currentCommit !== demo.skillCommit,
    liveUrl: demo.outputFile ? `${base}/live` : null,
    video: demo.video
      ? {
          src: `${base}/${demo.video.file}`,
          poster: `${base}/${demo.video.poster}`,
          width: demo.video.width,
          height: demo.video.height,
          durationSeconds: demo.video.durationSeconds,
        }
      : null,
    shots: demo.shots.map(shot => ({
      src: `${base}/${shot.file}`,
      width: shot.width,
      height: shot.height,
      alt: shot.alt,
      viewport: shot.viewport,
    })),
  }
}

/** The key of a demo's output page in the `skill-demos` server assets, or null for a video-only demo. */
export function skillDemoOutputKey(demo: SkillDemoRecord): string | null {
  return demo.outputFile ? `${demo.owner}/${demo.repo}/${demo.name}/${demo.outputFile}` : null
}
