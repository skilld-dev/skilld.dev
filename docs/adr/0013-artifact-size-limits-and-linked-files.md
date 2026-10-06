# ADR-0013: Artifact size limits and linked files

Date: 2026-10-07

Amends [ADR-0005](0005-v3-cli-harness-artifact-delivery.md).

## Context

A public build read every Skill file into memory, then packed a second copy as the archive.
Its limits were 10 MiB an Artifact, 2 MiB a file, and 900 files.
Only the 900 had a recorded reason: one blob read per file, against 1,000 subrequests.

#487 kept Skills over those limits running by leaving files out.
`latent-spaces/brag` then ran without the four music files its films use.
`oaustegard/claude-skills/tree-sitting` ran without eight of its parsers.

Each limit now names the constraint that sets it, measured on 2026-10-07.

## Constraints

| Constraint | Real limit | Old limit | New limit |
|---|---|---|---|
| Worker memory | 128 MB per isolate, shared with site requests | 10 MiB of files plus their 10 MiB archive, held at once | None from size. A build holds one network chunk, one inflate write of at most 16 KiB, SKILL.md, and the archive when it is at most 16 MiB |
| Worker CPU | 300 s for the queue consumer | Not measured | 1 GiB of archive per pass. Inflating and walking costs 4 to 5 ms per MiB, so about 5 s |
| Wall time | 15 min for the consumer. The skilld CLI waits 60 s for one Resolution | Not measured | A pass stops after the last Skill file. Cold codeload served PostHog/posthog (191 MiB gzipped) in 26 s |
| Subrequests | 1,000 per invocation | 900 files, one blob read each | No file limit. One or two archive reads, and at most 400 single-file reads for files the archive lacks |
| R2 put | 5 GiB in one part | Bytes in memory | A stream of known length in one part. R2 checks it against the SHA-256 the scan found |
| D1 row | 2,000,000 bytes | Not measured | A file list of 448 KiB. The Resolution row holds about 3.34 statements plus the check results |
| Signer | 128 MB per isolate | 10 MiB, read whole | 64 MiB, hashed as it streams |
| skilld CLI 3.0 to 3.6.2 | 64 MiB download, 2,000 files, 6 MiB statement. Before 3.6.2 a download gets 30 s, so 64 MiB needs 2.2 MB/s | 10 MiB, 900 files | 64 MiB and 2,000 files. These two now bind |
| USTAR | A path of at most 256 bytes | Checked after packing | Refused before any byte is read |
| [GitHub](https://github.com) | 100 MiB a file | Not applicable | Linked files of at most 256 MiB in all |

A private build keeps 10 MiB, 2 MiB a file, and 900 files.
It still reads one blob per request and encrypts the archive in memory.

## Decision

### A build streams the Repository archive

A public build reads `https://codeload.github.com/{owner}/{repository}/tar.gz/{commit}`.
That is one subrequest and spends no REST quota.
It inflates the archive in 16 KiB writes and keeps only the Skill folder's entries.
It stops reading after the last Skill file.

The Git tree still names every file, its mode, its size, and its blob SHA.
Each file's bytes are hashed as they pass and must match that blob SHA.
The archive is only a byte source, as before.

A file the archive lacks, or holds with another size, is read from `raw.githubusercontent.com` at the same commit.
Git LFS pointers, `export-ignore`, and `export-subst` produce those cases.
A file whose archive bytes keep their size and fail the digest is read the same way on a second pass.

Artifact order is the UTF-8 byte order of paths.
It is the order a Git archive lists a tree in.
All 487 archives of the 2026-10-07 sweep listed their files in that order.

The first pass learns the archive digest and size, the file inventory, and the check results.
An archive of at most 16 MiB stays in memory, and R2 stores it from there.
A larger one is read from GitHub a second time and streams into R2 under the digest from the first pass.
R2 refuses the put if one byte differs.
The store happens before the checks are recorded.
The CLI gives each stage after the checks 15 seconds.

### Limits

A public Artifact holds at most 64 MiB and 2,000 files.
A file has no limit of its own.

When the files exceed a limit, the largest leave the archive first.
For a CLI without linked files, only files the Skill does not read leave, and the `omitted-files` check lists them.
That is the #487 rule at the new limits.
More files than 2,000 leave the same way, so linked files do not change the file count.

### Linked files

A skilld CLI that sends `Skilld-Capabilities: linked-files` on `POST /api/v1/resolutions` may get linked files.
The Resolution stores that as `linked_files`, and the request fingerprint names it.

When the archive would pass 64 MiB, the largest files other than SKILL.md become linked files, up to 256 MiB.
The signed statement lists each one:

```json
{
  "linkedFiles": [
    { "path": "scripts/KimiXlsx", "mode": 420, "size": 77001601, "gitBlobSha": "<40 hex characters>" }
  ]
}
```

The CLI verifies the attestation first.
It then reads each linked file from `https://raw.githubusercontent.com/{owner}/{repository}/{commitSha}/{skillPath}/{path}`, each path segment percent-encoded.
It refuses the Skill unless every file has the declared size and Git blob SHA.
It installs the file with the declared mode, beside the archive's files.
The bytes never pass through skilld.dev, and the signature still covers them through the blob SHA.

The field is present only when it is not empty.
A CLI without linked files never receives it, because it refuses a statement field it does not know.
A build with linked files serves only a CLI that reads them.
A build that left nothing out serves both kinds.

## Consequences

`latent-spaces/brag` runs with its music: 289 files, 16.03 MiB, nothing left out.
`tt-a1i/archify` runs whole at 10.36 MiB.
`thedivergentai/gd-agentic-skills/godot-master` runs with 1,728 files.
`thvroyal/kimi-skills/kimi-xlsx` runs its 73 MiB binary as a linked file for a CLI that reads one.

A first run of a Skill late in a large archive can take longer than the CLI's 60-second wait.
The build still finishes, and the next run reuses it.

The previous policy `2026-10-07.2` stays signable. This change closes no safety gap.
A ready build under that policy that left nothing out packs the same files, so it is checked again from its bytes.
A stored archive over 16 MiB is never read back whole. It loads from GitHub.
