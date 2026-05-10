import type { Policy } from '#shared/server/handler'

export const authenticated: Policy<any> = ({ user }) => !!user?.id
