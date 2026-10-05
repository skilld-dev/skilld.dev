import type { DigestPreviewResult } from '../utils/digest-preview'

export function presentDigestPreview(result: DigestPreviewResult) {
  if (result._tag === 'rendered')
    return { _tag: result._tag, changeCount: result.changeCount, ...result.rendered }
  return result
}
