import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HEARTBEAT_INTERVAL_MS = 20_000

export interface HeartbeatCommand {
  file: string
  args: string[]
}

export interface HeartbeatDependencies {
  run: (command: HeartbeatCommand) => Promise<number>
  startHeartbeat: (write: () => void) => () => void
  writeHeartbeat: (message: string) => void
}

export async function runWithHeartbeat(
  command: HeartbeatCommand,
  dependencies: HeartbeatDependencies,
): Promise<number> {
  const stopHeartbeat = dependencies.startHeartbeat(() => {
    dependencies.writeHeartbeat('Command is still running.')
  })

  return dependencies.run(command).finally(stopHeartbeat)
}

function runCommand(command: HeartbeatCommand): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.file, command.args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (exitCode, signal) => {
      if (signal) {
        reject(new Error(`Command stopped after ${signal}.`))
        return
      }
      resolvePromise(exitCode ?? 1)
    })
  })
}

function startHeartbeat(write: () => void): () => void {
  const timer = setInterval(write, HEARTBEAT_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

async function main(): Promise<void> {
  const [file, ...args] = process.argv.slice(2)
  if (!file)
    throw new Error('Pass a command to run.')

  process.exitCode = await runWithHeartbeat(
    { file, args },
    {
      run: runCommand,
      startHeartbeat,
      writeHeartbeat: message => console.log(message),
    },
  )
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
