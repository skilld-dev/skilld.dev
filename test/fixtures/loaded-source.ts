import type { LinkedArtifactFile, ResolvedSource } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactSourceFile, LoadedArtifactSource, OmittedArtifactFile, SourceRejection } from '../../layers/artifact-delivery/server/utils/github-source'
import { createHash } from 'node:crypto'
import { scanArtifact } from '../../layers/artifact-delivery/server/utils/artifact-pack'
import { compareArtifactPaths, readDeterministicUstar } from '../../layers/artifact-delivery/server/utils/ustar'

/**
 * What a source client's `load` answers for files already in memory: the
 * packed files in Artifact order, and a reader that serves their bytes. The
 * Git blob digest is computed from the bytes, as a load verifies it, so a
 * fixture may name any placeholder.
 */
export function loadedFromFiles(
  source: ResolvedSource,
  files: ArtifactSourceFile[],
  extra: { omitted?: OmittedArtifactFile[], linked?: LinkedArtifactFile[] } = {},
): LoadedArtifactSource {
  const ordered = [...files]
    .sort((left, right) => compareArtifactPaths(left.path, right.path))
    .map(file => ({ ...file, gitBlobSha: createHash('sha1').update(`blob ${file.bytes.byteLength}\0`).update(file.bytes).digest('hex') }))
  return {
    source,
    files: ordered.map(file => ({ path: file.path, mode: file.mode, size: file.bytes.byteLength, gitBlobSha: file.gitBlobSha })),
    omitted: extra.omitted ?? [],
    linked: extra.linked ?? [],
    read: async (sink) => {
      for (const file of ordered) {
        await sink.begin({ path: file.path, mode: file.mode, size: file.bytes.byteLength, gitBlobSha: file.gitBlobSha }, 'archive')
        await sink.chunk(file.bytes)
        const ended = await sink.end()
        if (ended._tag === 'mismatch')
          return ended
      }
      return { _tag: 'read' }
    },
  }
}

/**
 * Reads a loaded source the way a build scans it, and answers the files it
 * packed, in Artifact order.
 */
export async function readLoadedFiles(loaded: LoadedArtifactSource): Promise<{ _tag: 'read', files: ArtifactSourceFile[] } | SourceRejection> {
  const scanned = await scanArtifact({
    source: loaded.source,
    files: loaded.files,
    read: loaded.read,
    omitted: loaded.omitted,
    spoolBytes: Number.POSITIVE_INFINITY,
  })
  if (scanned._tag === 'rejected')
    return scanned
  const files = await readDeterministicUstar(scanned.spool!)
  if (!files)
    throw new Error('The scan packed an archive it cannot read back')
  return { _tag: 'read', files }
}
