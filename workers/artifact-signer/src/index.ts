import { handleArtifactSignerRequest } from './handler'

export default {
  async fetch(request: Request, env: ArtifactSignerEnv): Promise<Response> {
    return await handleArtifactSignerRequest(request, env)
  },
} satisfies ExportedHandler<ArtifactSignerEnv>
