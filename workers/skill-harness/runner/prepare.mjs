import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const bridge = join(dirname(require.resolve('@ai-sdk/harness-opencode')), 'bridge')
mkdirSync('/opt/bootstrap', { recursive: true })
cpSync(bridge, '/opt/bootstrap', { recursive: true })
execFileSync('pnpm', ['install', '--frozen-lockfile', '--store-dir', '.pnpm-store'], { cwd: '/opt/bootstrap', stdio: 'inherit' })
