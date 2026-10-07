import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const folder = await mkdtemp(join(tmpdir(), 'shell-temp-'))
process.stdout.write(folder)
await rm(folder, { recursive: true })
