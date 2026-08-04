import { createMissingBuildAssetResponse } from '../../../utils/missing-build-asset'

export default defineEventHandler(() => {
  // Existing files are served by Cloudflare's asset binding before the Worker.
  // Only misses reach this route. Never let a transient deployment miss become
  // an immutable browser or edge response.
  return createMissingBuildAssetResponse()
})
