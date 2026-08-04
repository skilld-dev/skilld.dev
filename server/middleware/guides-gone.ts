export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (pathname !== '/guides' && !pathname.startsWith('/guides/'))
    return

  throw createError({
    statusCode: 410,
    statusMessage: 'Gone',
    message: 'This guide is no longer available.',
  })
})
