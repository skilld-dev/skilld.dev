import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { glob } from 'tinyglobby'
import { buildTree, toVueRouter4 } from 'unrouting'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const AccountPage = defineComponent({ name: 'AccountPage' })
const DevicesPage = defineComponent({ name: 'DevicesPage' })
const TokenPage = defineComponent({ name: 'TokenPage' })

function pageComponent(file: string | undefined): Component {
  if (file?.endsWith('/devices.vue'))
    return DevicesPage
  if (file?.endsWith('/new.vue'))
    return TokenPage
  return AccountPage
}

async function accountRoutes(): Promise<RouteRecordRaw[]> {
  const roots = [
    `${process.cwd()}/app/pages`,
    `${process.cwd()}/layers/identity/app/pages`,
  ]
  const files = await glob(roots.flatMap(root => [`${root}/me.vue`, `${root}/me/**/*.vue`]), { absolute: true })
  const routes = toVueRouter4(buildTree(files, { roots }))

  function toRouteRecord(route: (typeof routes)[number]): RouteRecordRaw {
    return {
      path: route.path,
      component: pageComponent(route.file),
      children: route.children.map(toRouteRecord),
    }
  }

  return routes.map(toRouteRecord)
}

describe('account subroutes', () => {
  it('renders the devices page at /me/devices', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: await accountRoutes() })
    const route = router.resolve('/me/devices')

    expect(route.matched[0]?.components?.default).toBe(DevicesPage)
  })
})
