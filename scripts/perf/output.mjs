import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'

// Shared by the case files. Each case counts one thing in a built `.output`,
// so it carries no measurement noise: the same build gives the same number.

const BUILD_ASSETS = 'public/_nuxt/v2'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? undefined : process.argv[index + 1]
  if (value === undefined)
    throw new Error(`Pass --${name}`)
  return value
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

/** The `.output` directory of the checkout the harness names with `--root`. */
export function outputRoot() {
  const root = join(argument('root'), '.output')
  if (!existsSync(join(root, 'nitro.json')))
    throw new Error(`${root} holds no Nitro build. Build this checkout first.`)
  return root
}

/** Every server file except source maps. This is what wrangler uploads. */
export function serverFiles(root) {
  return files(join(root, 'server')).filter(path => !path.endsWith('.map'))
}

/**
 * The client files this build produced.
 *
 * nuxt-skew-protection copies the chunks of earlier deploys into the output,
 * so old sessions still load. A build that restored that cache would count
 * every earlier deploy as well. `latest.json` names the retained JavaScript
 * chunks, so those are left out here. The metadata records deleted `.js`
 * only, and no metadata names the other restored asset types. A warm local
 * cache can therefore leave stale `.css` files in the output. The
 * non-JavaScript cases that read this list then count them. Stored
 * Measurements stay exact: CI measures cold git-archive exports, so nothing
 * is restored there.
 */
export function clientFiles(root) {
  const assets = join(root, BUILD_ASSETS)
  const latest = join(assets, 'builds/latest.json')
  const retained = new Set()
  if (existsSync(latest)) {
    const versions = JSON.parse(readFileSync(latest, 'utf8')).skewProtection?.versions ?? {}
    for (const version of Object.values(versions)) {
      for (const chunk of version.deletedChunks ?? [])
        retained.add(chunk)
    }
  }
  const publicRoot = join(root, 'public')
  return files(assets)
    .filter(path => !path.endsWith('.map'))
    .filter(path => !retained.has(relative(publicRoot, path).split(sep).join('/')))
}

/**
 * The client entry chunk, read from the server's precomputed render manifest.
 *
 * Exactly one entry must match. Anything else means Nuxt changed the manifest
 * shape, and a guess would store a wrong number.
 */
export function entryFile(root) {
  const manifest = readFileSync(join(root, 'server/chunks/virtual/precomputed.mjs'), 'utf8')
  const entries = new Set([...manifest.matchAll(/file:"([^"]+\.js)",name:"entry",src:"[^"]*",isEntry:!0/g)].map(match => match[1]))
  if (entries.size !== 1)
    throw new Error(`Expected one client entry in the render manifest, found ${entries.size}.`)
  return join(root, BUILD_ASSETS, [...entries][0])
}

export const bytes = paths => paths.reduce((total, path) => total + statSync(path).size, 0)

/** Default level, the same one a Worker upload reports. */
export const gzipBytes = paths => paths.reduce((total, path) => total + gzipSync(readFileSync(path)).length, 0)

/** Answers the harness protocol for a case that counts. */
export function countCase(count) {
  const command = process.argv[2]
  if (command === 'prepare')
    console.log(JSON.stringify({ value: 0 }))
  else if (command === 'sample')
    console.log(JSON.stringify({ value: count(outputRoot()), checksum: 'count' }))
  else
    throw new Error(`Unknown command: ${command}`)
}
