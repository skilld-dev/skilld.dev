import { CLOUDFLARE_WEB_ANALYTICS_TOKEN } from '#shared/rum-beacon'

export default defineNuxtPlugin({
  env: { islands: false },
  setup() {
    useScript({
      'src': 'https://static.cloudflareinsights.com/beacon.min.js',
      'data-cf-beacon': JSON.stringify({ token: CLOUDFLARE_WEB_ANALYTICS_TOKEN, spa: true }),
      'crossorigin': false,
    }, { bundle: true, trigger: 'server' })
  },
})
