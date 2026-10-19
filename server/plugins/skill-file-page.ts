import claimSkillFilePage from '../handlers/skill-file-page'

// nuxt-ai-ready prepends h3 middleware that caches the request's Markdown
// decision. Nitro's request hook runs before that middleware can claim a file.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', claimSkillFilePage)
})
