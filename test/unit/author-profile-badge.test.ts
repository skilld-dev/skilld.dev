import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { reactive, ref, toValue } from 'vue'

const route = reactive({
  path: '/@jd-solanki',
  query: {},
  params: { login: 'jd-solanki' },
})

const skills = [
  {
    owner: 'jd-solanki',
    repo: 'skills',
    name: 'setup-jd-solanki-skills',
    display_name: 'Setup JD Solanki skills',
    slug: 'jd-solanki/skills/setup-jd-solanki-skills',
    description: null,
    likeCount: 0,
    modified_at: null,
    last_synced_at: null,
    skill_path: 'skills/scaffolding/setup-jd-solanki-skills/SKILL.md',
    source_owner: null,
    source_repo: null,
    default_branch: 'main',
  },
  {
    owner: 'jd-solanki',
    repo: 'skills',
    name: 'bruno',
    display_name: 'Bruno',
    slug: 'jd-solanki/skills/bruno',
    description: null,
    likeCount: 0,
    modified_at: null,
    last_synced_at: null,
    skill_path: 'skills/bruno/SKILL.md',
    source_owner: null,
    source_repo: null,
    default_branch: 'main',
  },
]

mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('useUserSession', () => () => ({ user: ref(null) }))
mockNuxtImport('useFetch', () => (url: unknown) => {
  const key = String(toValue(url))
  const value = key.includes('/skills')
    ? { items: skills }
    : key.includes('/collections/')
      ? { items: [] }
      : {
          displayName: 'JD Solanki',
          description: '',
          avatar: 'https://github.com/jd-solanki.png',
          github: 'https://github.com/jd-solanki',
          blog: null,
          location: null,
        }
  return {
    data: ref(value),
    error: ref(null),
    refresh: vi.fn(),
  }
})

vi.stubGlobal('defineOgImage', () => {})

async function mountPage() {
  return await mountSuspended(
    await import('../../app/pages/@[login]/index.vue').then(module => module.default),
    {
      global: {
        stubs: {
          LikeButton: true,
          NuxtTime: true,
        },
      },
    },
  )
}

describe('public author profile badges', () => {
  it('shows a minimal badge for the repository page', async () => {
    const wrapper = await mountPage()

    const sources = wrapper.findAll('[data-testid="minimal-badge-light"]').map(image => image.attributes('src'))
    expect(sources).toContain('/b/jd-solanki/skills?theme=light&label=0')
    wrapper.unmount()
  })

  it('shows a minimal badge for each individual skill page', async () => {
    const wrapper = await mountPage()

    const sources = wrapper.findAll('[data-testid="minimal-badge-light"]').map(image => image.attributes('src'))
    expect(sources).toContain('/b/jd-solanki/skills/setup-jd-solanki-skills?theme=light&label=0')
    wrapper.unmount()
  })
})
