import { createApiRateLimitHandler } from '#shared/server/api-rate-limit'
import { resolveRequestUser } from '#shared/server/handler'

export default createApiRateLimitHandler(resolveRequestUser)
