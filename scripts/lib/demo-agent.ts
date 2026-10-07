import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Keep live evidence and close the input stream before waiting for an Agent. */
export async function runDemoAgent(input: { command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number }): Promise<{ stdout: string }> {
  const eventsLog = createWriteStream(join(input.cwd, 'codex-events.jsonl'))
  const stderrLog = createWriteStream(join(input.cwd, 'codex-stderr.log'))
  const execution = run(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout,
    maxBuffer: 64 * 1024 * 1024,
  })
  execution.child.stdin?.end()
  execution.child.stdout?.pipe(eventsLog)
  execution.child.stderr?.pipe(stderrLog)
  const [{ stdout }] = await Promise.all([execution, finished(eventsLog), finished(stderrLog)])
  return { stdout }
}
