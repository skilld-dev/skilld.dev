import { expect, test } from './test-utils'

test('renders highlighted Learn code with distinct token colors', async ({ page, hydrationErrors }) => {
  await page.goto('/learn/author-npm-package-skills')

  const code = page.locator('pre.rangi.shiki').first()
  await expect(code).toBeVisible()

  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  })
  const lightTokenColors = await code.locator('span').evaluateAll(tokens => (
    [...new Set(tokens.map(token => getComputedStyle(token).color))]
  ))
  await page.evaluate(() => {
    document.documentElement.classList.remove('light')
    document.documentElement.classList.add('dark')
  })
  const darkTokenColors = await code.locator('span').evaluateAll(tokens => (
    [...new Set(tokens.map(token => getComputedStyle(token).color))]
  ))

  expect(lightTokenColors.length).toBeGreaterThan(1)
  expect(darkTokenColors.length).toBeGreaterThan(1)
  expect(darkTokenColors).not.toEqual(lightTokenColors)
  expect(hydrationErrors).toEqual([])
})
