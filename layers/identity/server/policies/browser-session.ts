import type { Policy } from '#shared/server/handler'

/**
 * The request carries a skilld.dev sign-in cookie.
 *
 * A CLI bearer token alone does not pass. A token copied off a machine must
 * not be able to delete the account it belongs to.
 */
export const browserSession: Policy<any> = ({ session }) => typeof session?.user?.id === 'number'
