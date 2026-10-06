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
    sha256: checksumBytes(input.contentSha256),
    ...immutableArtifactOptions(input.contentSha256),
  })
  if (stored)
    return { _tag: 'stored', key: input.key }

  const existing = await bucket.head(input.key)
  return matchesImmutableArtifact(existing, { contentSha256: input.contentSha256, contentBytes: input.bytes.byteLength })
    ? { _tag: 'existing', key: input.key }
    : { _tag: 'mutation-rejected', key: input.key }
}

/**
 * Whether R2 still holds the exact public Artifact bytes under this key.
 *
 * It reads only object metadata. The artifact signer still reads and hashes the
 * whole object before it signs.
 */
export async function hasImmutableArtifact(
  bucket: R2Bucket,
  input: { key: string, contentSha256: string, contentBytes: number },
): Promise<boolean> {
  return matchesImmutableArtifact(await bucket.head(input.key), input)
}

function matchesImmutableArtifact(
  object: R2Object | null,
  expected: { contentSha256: string, contentBytes: number },
): boolean {
  return object !== null
    && object.size === expected.contentBytes
    && checksumHex(object.checksums.sha256) === expected.contentSha256
    && object.customMetadata?.contentSha256 === expected.contentSha256
    && object.customMetadata?.format === 'skilld-tar-v1'
}

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value)
    return null
  return [...new Uint8Array(value)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function checksumBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16))
}

export type StreamedArtifactWrite<Failure>
  = ImmutableArtifactWrite
    | { _tag: 'write-failed', failure: Failure }

/**
 * Stores an archive as it is written, never holding it whole.
 *
 * R2 takes a stream of known length in one part, and checks it against the
 * SHA-256 the build already learned from its scan, so a byte that differs
 * fails the put. The object keeps the checksum the signer and every reuse
 * read back. A multipart upload would carry no whole-object SHA-256.
 */
export async function putImmutableArtifactStream<Failure>(
  bucket: R2Bucket,
  input: {
    key: string
    contentSha256: string
    contentBytes: number
    /** Writes exactly `contentBytes`, or answers a failure and writes nothing more. */
    write: (write: (bytes: Uint8Array) => Promise<void>) => Promise<{ _tag: 'written' } | { _tag: 'failed', failure: Failure }>
  },
  fixedLengthStream: (length: number) => TransformStream<Uint8Array, Uint8Array> = length => new FixedLengthStream(length),
): Promise<StreamedArtifactWrite<Failure>> {
  const expected = { contentSha256: input.contentSha256, contentBytes: input.contentBytes }
  if (matchesImmutableArtifact(await bucket.head(input.key), expected))
    return { _tag: 'existing', key: input.key }
  const { readable, writable } = fixedLengthStream(input.contentBytes)
  const writer = writable.getWriter()
  const stored = bucket.put(input.key, readable, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: checksumBytes(input.contentSha256),
    ...immutableArtifactOptions(input.contentSha256),
  }).then(
    object => ({ _tag: 'put' as const, object }),
    (error: unknown) => ({ _tag: 'refused' as const, error }),
  )
  const written = await input.write(async (bytes) => {
    await writer.write(bytes)
  }).then(
    outcome => outcome,
    (error: unknown) => ({ _tag: 'threw' as const, error }),
  )
  if (written._tag !== 'written') {
    // An aborted stream ends the put without an object.
    await writer.abort(written._tag === 'failed' ? 'write failed' : written.error).catch(() => {
      // The put may have ended the stream first. Either way no object exists.
    })
    await stored
    if (written._tag === 'threw')
      throw written.error
    return { _tag: 'write-failed', failure: written.failure }
  }
  await writer.close()
  const put = await stored
  if (put._tag === 'refused')
    throw put.error
  if (put.object)
    return { _tag: 'stored', key: input.key }
  // Another build stored the same key first.
  return matchesImmutableArtifact(await bucket.head(input.key), expected)
    ? { _tag: 'existing', key: input.key }
    : { _tag: 'mutation-rejected', key: input.key }
}

function immutableArtifactOptions(contentSha256: string): Pick<R2PutOptions, 'httpMetadata' | 'customMetadata'> {
  return {
    httpMetadata: {
      contentType: 'application/x-tar',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: `attachment; filename="${contentSha256}.tar"`,
    },
    customMetadata: {
      contentSha256,
      format: 'skilld-tar-v1',
    },
  }
}
