#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

function parseArguments(arguments_) {
  const options = {
    endpoint: '/api/ping',
    maxEntrypointBytes: undefined,
    maxStartupMs: undefined,
    port: 9310,
    root: process.cwd(),
    runs: 5,
    timeoutMs: 30_000,
  }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    const value = arguments_[index + 1]

    if (argument === '--endpoint' && value) {
      options.endpoint = value
      index += 1
    }
    else if (argument === '--port' && value) {
      options.port = Number.parseInt(value, 10)
      index += 1
    }
    else if (argument === '--max-entrypoint-bytes' && value) {
      options.maxEntrypointBytes = Number.parseInt(value, 10)
      index += 1
    }
    else if (argument === '--max-startup-ms' && value) {
      options.maxStartupMs = Number.parseInt(value, 10)
      index += 1
    }
    else if (argument === '--root' && value) {
      options.root = resolve(value)
      index += 1
    }
    else if (argument === '--runs' && value) {
      options.runs = Number.parseInt(value, 10)
      index += 1
    }
    else if (argument === '--timeout' && value) {
      options.timeoutMs = Number.parseInt(value, 10)
      index += 1
    }
  }

  const integerOptions = [
    options.port,
    options.runs,
    options.timeoutMs,
    ...[options.maxEntrypointBytes, options.maxStartupMs].filter(value => value !== undefined),
  ]
  if (integerOptions.some(value => !Number.isInteger(value) || value <= 0)) {
    throw new Error('Port, runs, and timeout must be positive integers.')
  }
  if (!options.endpoint.startsWith('/')) {
    throw new Error('Endpoint must begin with "/".')
  }

  return options
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]

  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
    minimum: sorted[0],
    maximum: sorted.at(-1),
  }
}

async function stopWorker(worker) {
  if (worker.exitCode !== null) {
    return
  }

  process.kill(-worker.pid, 'SIGTERM')
  const exited = once(worker, 'exit')
  const forced = delay(2_000).then(() => {
    if (worker.exitCode === null) {
      process.kill(-worker.pid, 'SIGKILL')
    }
  })
  await Promise.race([exited, forced])
}

async function measureRun({ endpoint, port, root, timeoutMs }) {
  const wrangler = resolve(root, 'node_modules/.bin/wrangler')
  const output = resolve(root, '.output')
  await Promise.all([access(wrangler), access(output)])

  // `--cwd .output` means wrangler never sees the repo-root .dev.vars, so point
  // it back at the real file when one exists.
  const envFile = resolve(root, '.dev.vars')
  const hasEnvFile = await access(envFile).then(() => true, () => false)

  const errors = []
  const startedAt = performance.now()
  const worker = spawn(
    wrangler,
    [
      'dev',
      '--cwd',
      output,
      '--port',
      String(port),
      '--local',
      '--log-level',
      'error',
      ...(hasEnvFile ? ['--env-file', envFile] : []),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NUXT_SESSION_PASSWORD: process.env.NUXT_SESSION_PASSWORD
          ?? 'local-cold-start-benchmark-secret-32-characters',
      },
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  worker.stderr.setEncoding('utf8')
  worker.stderr.on('data', (chunk) => {
    errors.push(chunk)
    if (errors.join('').length > 8_192) {
      errors.shift()
    }
  })

  const url = `http://127.0.0.1:${port}${endpoint}`
  let firstResponse

  try {
    while (performance.now() - startedAt < timeoutMs) {
      if (worker.exitCode !== null) {
        throw new Error(`Wrangler exited with code ${worker.exitCode}.\n${errors.join('')}`)
      }

      firstResponse = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      }).catch((error) => {
        errors.push(`Readiness probe failed: ${error instanceof Error ? error.message : String(error)}\n`)
        return undefined
      })

      if (firstResponse?.ok) {
        await firstResponse.arrayBuffer()
        break
      }
      await delay(10)
    }

    if (!firstResponse?.ok) {
      throw new Error(`Worker did not become ready within ${timeoutMs} ms.\n${errors.join('')}`)
    }

    const readyAt = performance.now()
    const warmStartedAt = performance.now()
    const warmResponse = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    })
    await warmResponse.arrayBuffer()
    const warmFinishedAt = performance.now()

    return {
      startupMs: readyAt - startedAt,
      warmRequestMs: warmFinishedAt - warmStartedAt,
    }
  }
  finally {
    await stopWorker(worker)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const samples = []
  const entrypoint = resolve(options.root, '.output/server/chunks/nitro/nitro.mjs')
  const entrypointBytes = (await stat(entrypoint)).size

  for (let run = 0; run < options.runs; run += 1) {
    samples.push(await measureRun({
      ...options,
      port: options.port + run,
    }))
  }

  const result = {
    root: options.root,
    endpoint: options.endpoint,
    runs: options.runs,
    entrypointBytes,
    startupMs: summarize(samples.map(sample => sample.startupMs)),
    warmRequestMs: summarize(samples.map(sample => sample.warmRequestMs)),
    samples,
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

  if (options.maxEntrypointBytes !== undefined && entrypointBytes > options.maxEntrypointBytes) {
    throw new Error(`Nitro entrypoint is ${entrypointBytes} bytes; budget is ${options.maxEntrypointBytes}.`)
  }
  if (options.maxStartupMs !== undefined && result.startupMs.median > options.maxStartupMs) {
    throw new Error(`Median cold start is ${result.startupMs.median.toFixed(1)} ms; budget is ${options.maxStartupMs} ms.`)
  }
}

await main()
