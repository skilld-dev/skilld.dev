import { defineHttpCheck } from '@harlan-zw/nuxt-checkin/external'

export default defineHttpCheck({
  id: 'skilld.home',
  url: 'https://skilld.dev/',
  status: 200,
  attempts: 2,
})
