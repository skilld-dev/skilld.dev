import { expect, test } from './test-utils'

/**
 * OG image snapshot tests (Takumi templates).
 *
 * Page-level tests validate the full flow: page renders → og:image meta tag → fetch image.
 * Direct template tests hit the /_og/d/ endpoint with hardcoded props for templates
 * that depend on live data (curators, collections, skills from AT Proto / skills.sh).
 */

// Page-level tests: validates meta tag presence + image rendering
const pageCases = [
  { path: '/', label: 'home page' },
  { path: '/skills', label: 'skills index' },
  { path: '/skills/official', label: 'official skills' },
  { path: '/people', label: 'curators index' },
  { path: '/accessibility', label: 'accessibility' },
] as const

for (const { path, label } of pageCases) {
  test.describe(`${label} (${path})`, () => {
    test('og image snapshot', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })

      const ogImageUrl = await page
        .locator('meta[property="og:image"]')
        .first()
        .getAttribute('content')
      expect(ogImageUrl).toBeTruthy()

      const ogImagePath = new URL(ogImageUrl!).pathname
      const localUrl = baseURL?.endsWith('/')
        ? `${baseURL}${ogImagePath.slice(1)}`
        : `${baseURL}${ogImagePath}`
      const response = await page.request.get(localUrl)

      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')

      const imageBuffer = await response.body()
      expect(imageBuffer).toMatchSnapshot({
        name: `og-image-${path.replace(/\//g, '-').replace(/^-/, '') || 'home'}.png`,
        maxDiffPixelRatio: 0.02,
      })
    })
  })
}

// Direct template tests: hit /_og/d/ with props encoded in the path
// This reliably tests templates that need AT Proto or skills.sh data
const directCases = [
  {
    label: 'skill (short name)',
    props: 'c_Skill.takumi,name_nuxt,owner_nuxt-modules,repo_skills,curatorCount_3',
  },
  {
    label: 'skill (long name, custom repo)',
    props: 'c_Skill.takumi,name_vercel-react-best-practices,owner_vercel-labs,repo_agent-skills,curatorCount_1',
  },
  {
    label: 'curator profile',
    props: 'c_Curator.takumi,handle_harlan.computer,displayName_Harlan+Wilton,description_Building+open+source+tools+for+the+Nuxt+ecosystem,collectionCount_3,skillCount_12',
  },
  {
    label: 'curator (no display name)',
    props: 'c_Curator.takumi,handle_someone.bsky.social,collectionCount_1,skillCount_5',
  },
  {
    label: 'collection',
    props: 'c_Collection.takumi,name_My+Nuxt+Stack,description_Full+production+Nuxt+setup+with+TypeScript+and+Tailwind,curatorHandle_harlan.computer,curatorName_Harlan+Wilton,skillCount_8',
  },
] as const

for (const { label, props } of directCases) {
  test.describe(`${label}`, () => {
    test('og image snapshot', async ({ page, baseURL }) => {
      const url = `${baseURL}/_og/d/${props}.png`
      const response = await page.request.get(url)

      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')

      const imageBuffer = await response.body()
      const snapshotName = `og-image-${label.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase()}.png`
      expect(imageBuffer).toMatchSnapshot({
        name: snapshotName,
        maxDiffPixelRatio: 0.02,
      })
    })
  })
}
