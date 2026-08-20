export type ImmutableArtifactWrite
  = { _tag: 'stored' | 'existing', key: string }
    | { _tag: 'mutation-rejected', key: string }

export function artifactR2Key(contentSha256: string): string {
  return `v1/sha256/${contentSha256.slice(0, 2)}/${contentSha256}.tar`
}

export async function putImmutableArtifact(
  bucket: R2Bucket,
  input: { key: string, bytes: Uint8Array, contentSha256: string },
): Promise<ImmutableArtifactWrite> {
  const stored = await bucket.put(input.key, input.bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: {
      contentType: 'application/x-tar',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: `attachment; filename="${input.contentSha256}.tar"`,
    },
    customMetadata: {
      contentSha256: input.contentSha256,
      format: 'skilld-tar-v1',
    },
  })
  if (stored)
    return { _tag: 'stored', key: input.key }

  const existing = await bucket.head(input.key)
  if (
    existing
    && existing.size === input.bytes.byteLength
    && existing.customMetadata?.contentSha256 === input.contentSha256
    && existing.customMetadata?.format === 'skilld-tar-v1'
  ) {
    return { _tag: 'existing', key: input.key }
  }
  return { _tag: 'mutation-rejected', key: input.key }
}
