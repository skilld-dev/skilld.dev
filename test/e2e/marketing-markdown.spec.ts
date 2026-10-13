import { expect, test } from './test-utils'

test('Agent guide Markdown includes its rendered curated Skill section', async ({ request }) => {
  const response = await request.get('/agents/cursor.md')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/markdown')
  const markdown = await response.text()
  expect(markdown).toContain('Curated Skills for Cursor')
  expect(markdown).toContain('Most Cursor readers build interfaces')
  expect(markdown).toContain('/gh/jakubkrehel/make-interfaces-feel-better')
})

test('research Markdown includes the rendered chart values', async ({ request }) => {
  const response = await request.get('/learn/research/skill-md-size-study.md')
  expect(response.status()).toBe(200)
  const markdown = await response.text()
  expect(markdown).toContain('Most Skill bodies fit below 5,000 tokens')
  expect(markdown).toContain('8,496')
  expect(markdown).toContain('2,564')
  expect(markdown).toContain('1,078')
  expect(markdown).not.toContain('::skill-size-study')
})

test('framework Markdown lists every Skill in the directory response', async ({ request }) => {
  const source = await request.get('/api/tags/nuxt?view=data')
  expect(source.status()).toBe(200)
  const profile = await source.json() as { skills: { registryPath: string }[] }
  const response = await request.get('/frameworks/nuxt.md')
  expect(response.status()).toBe(200)
  const markdown = await response.text()
  for (const skill of profile.skills)
    expect(markdown).toContain(skill.registryPath)
})
