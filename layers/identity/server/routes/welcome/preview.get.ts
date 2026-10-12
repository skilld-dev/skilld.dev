import { renderWelcomeEmail } from '../../utils/welcome-email'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'x-robots-tag', 'noindex, follow')
  return renderWelcomeEmail('https://skilld.dev/me', 'Email preferences').html
})
