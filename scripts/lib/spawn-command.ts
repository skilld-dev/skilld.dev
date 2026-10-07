import type { ProductionCommand, ProductionCommandResult } from './production-deploy'
import { spawn } from 'node:child_process'
import { basename } from 'node:path'

/** Runs one executable, echoes its output, and keeps the output for the caller. */
export function createCommand(executable: string, cwd: string = process.cwd()): ProductionCommand {
  return args => new Promise<ProductionCommandResult>((resolvePromise, rejectPromise) => {
    console.log(`$ ${basename(executable)} ${args.join(' ')}`)
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const value = chunk.toString()
      stdout += value
      process.stdout.write(value)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const value = chunk.toString()
      stderr += value
      process.stderr.write(value)
    })
    child.on('error', rejectPromise)
    child.on('close', (exitCode) => {
      resolvePromise(exitCode === 0
        ? { _tag: 'passed', stdout, stderr }
        : { _tag: 'failed', stdout, stderr, exitCode: exitCode ?? 1 })
    })
  })
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}
