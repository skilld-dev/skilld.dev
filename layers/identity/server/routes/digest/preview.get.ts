export default defineCachedEventHandler(async (event) => {
  const demo = await $fetch<{ html: string }>('/api/digest/demo')
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'x-robots-tag', 'noindex, follow')
  return demo.html
}, { maxAge: 3600, swr: true, name: 'public-digest-preview-v1' })
