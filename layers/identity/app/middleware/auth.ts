export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value) {
    const returnTo = to.fullPath
    return navigateTo(`/login?return_to=${encodeURIComponent(returnTo)}`, { replace: true })
  }
})
