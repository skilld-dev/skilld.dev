import { describe, expect, it, vi } from 'vitest'
import { runWithHeartbeat } from '../../scripts/run-with-heartbeat'

describe('run with heartbeat', () => {
  it('writes while the command runs and stops after completion', async () => {
    let complete!: (exitCode: number) => void
    let heartbeat!: () => void
    const stopHeartbeat = vi.fn()
    const writeHeartbeat = vi.fn()
    const result = runWithHeartbeat(
      { file: 'pnpm', args: ['build'] },
      {
        run: () => new Promise((resolve) => {
          complete = resolve
        }),
        startHeartbeat: (write) => {
          heartbeat = write
          return stopHeartbeat
        },
        writeHeartbeat,
      },
    )

    heartbeat()
    expect(writeHeartbeat).toHaveBeenCalledWith('Command is still running.')

    complete(0)
    await expect(result).resolves.toBe(0)
    expect(stopHeartbeat).toHaveBeenCalledOnce()
  })

  it('stops after a command error and preserves the error', async () => {
    const commandError = new Error('Build failed.')
    const stopHeartbeat = vi.fn()

    const result = runWithHeartbeat(
      { file: 'pnpm', args: ['build'] },
      {
        run: () => Promise.reject(commandError),
        startHeartbeat: () => stopHeartbeat,
        writeHeartbeat: vi.fn(),
      },
    )

    await expect(result).rejects.toBe(commandError)
    expect(stopHeartbeat).toHaveBeenCalledOnce()
  })
})
