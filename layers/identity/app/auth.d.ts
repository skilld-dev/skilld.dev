declare module '#auth-utils' {
  interface User {
    id: number
    githubId: number
    login: string
    name: string | null
    avatar: string | null
    onboarded: boolean
  }
  interface UserSession {
    user: User
    loggedInAt: number
  }
  interface SecureSessionData {
    // future: refresh tokens, scopes for re-auth checks
  }
}

export {}
