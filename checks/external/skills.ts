import { defineHttpCheck } from '@harlan-zw/nuxt-checkin/external'

export default defineHttpCheck({
  id: 'skilld.skills',
  url: 'https://skilld.dev/skills',
  status: 200,
  attempts: 2,
})
