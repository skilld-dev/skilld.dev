import { expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { createApp, h } from 'vue'
import SkillFileTree from '../../layers/registry/app/components/SkillFileTree.vue'

it('opens one Skill file tree with the keyboard and keeps the other closed', async ({ onTestFinished }) => {
  const props = {
    assets: [
      { path: 'references/notes.md', size: 10, type: 'markdown' as const },
      { path: 'scripts/setup.ts', size: 10, type: 'code' as const },
    ],
    owner: 'acme',
    repo: 'skills',
    name: 'setup',
    registryPath: '/gh/acme/skills/setup',
    branch: 'main',
  }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(() => ['Inline tree', 'Floating tree'].map(label =>
    h('section', { 'aria-label': label }, [h(SkillFileTree, props)]),
  ))
  app.component('UIcon', () => null)
  app.mount(host)
  onTestFinished(() => {
    app.unmount()
    host.remove()
  })

  const inlineTree = page.getByRole('region', { name: 'Inline tree' })
  const floatingTree = page.getByRole('region', { name: 'Floating tree' })
  const inlineFolder = inlineTree.getByRole('button', { name: /references/ })
  const floatingFolder = floatingTree.getByRole('button', { name: /references/ })
  await expect.element(inlineFolder).toHaveAttribute('aria-expanded', 'false')
  await expect.element(floatingFolder).toHaveAttribute('aria-expanded', 'false')

  await userEvent.tab()
  await expect.element(inlineFolder).toHaveFocus()
  await userEvent.keyboard('{Enter}')

  await expect.element(inlineTree.getByRole('link', { name: /notes\.md/ })).toBeVisible()
  await expect.element(floatingFolder).toHaveAttribute('aria-expanded', 'false')
  const controlledId = inlineFolder.element().getAttribute('aria-controls')!
  const controlledList = document.getElementById(controlledId)
  expect(inlineTree.element().contains(controlledList)).toBe(true)
  expect(floatingFolder.element()).not.toHaveAttribute('aria-controls', controlledId)
})
