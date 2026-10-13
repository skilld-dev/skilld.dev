import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'

/** Markdown includes the full directory, including rows behind the browser's load-more control. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:markdown:source', async (context) => {
    const match = /^\/frameworks\/(nuxt|nextjs|react|vue)$/.exec(context.route)
    if (!match)
      return
    const profile = await context.event.$fetch<TagProfile>(`/api/tags/${match[1]}`, { query: { view: 'data' } })
    const text = (value: string) => value.replace(/\s+/g, ' ').replace(/[\\`*_{}[\]<>]/g, '\\$&')
    const title = `Skills for ${profile.tag.label}`
    const rows = profile.skills.map(skill => [
      `- [${text(skill.name)}](${skill.registryPath})`,
      '  ' + text(skill.authorName || skill.owner) + ' · ' + text(skill.owner + '/' + skill.repo),
      '  ' + skill.stars.toLocaleString('en-US') + ' GitHub stars',
      ...(skill.description ? [`  ${text(skill.description)}`] : []),
    ].join('\n'))
    context.source = {
      title,
      description: profile.tag.description,
      markdown: [
        `# ${title}`,
        text(profile.tag.description),
        `## ${profile.tag.label} skills`,
        ...rows,
      ].join('\n\n'),
    }
  })
})
