const atHandleRegex = /^\/@([\w.-]+)$/

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const match = path.match(atHandleRegex)
  if (!match)
    return

  return sendRedirect(event, `/people/${match[1]}`, 301)
})
