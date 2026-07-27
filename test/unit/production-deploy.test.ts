import type {
  ProductionCommand,
  ProductionDeployDependencies,
} from '../../scripts/lib/production-deploy'
import { describe, expect, it, vi } from 'vitest'
import {
  parseActiveProductionVersion,
  runProductionDeployment,
} from '../../scripts/lib/production-deploy'

const previousVersion = '11111111-1111-4111-8111-111111111111'
const deployedVersion = '22222222-2222-4222-8222-222222222222'
const externalVersion = '33333333-3333-4333-8333-333333333333'

function deployment(versionId: string, createdOn: string): unknown {
  return {
    id: crypto.randomUUID(),
    created_on: createdOn,
    versions: [{ version_id: versionId, percentage: 100 }],
  }
}

function commandPassed(stdout = '') {
  return { _tag: 'passed' as const, stdout, stderr: '' }
}

function deployments(...values: unknown[]) {
  return commandPassed(JSON.stringify(values))
}

function passedSmoke() {
  return { _tag: 'passed' as const, checks: [{ path: '/', attempts: 1 }] }
}

function failedSmoke() {
  return {
    _tag: 'failed' as const,
    failures: [{
      path: '/',
      attempts: 2,
      result: {
        _tag: 'failed' as const,
        reason: 'status_mismatch' as const,
        expected: '200',
        actual: '500',
      },
    }],
  }
}

function dependencies(
  command: ProductionCommand,
  smoke = vi.fn()
    .mockResolvedValueOnce(passedSmoke()),
): ProductionDeployDependencies {
  return {
    command,
    smoke,
    releaseSha: 'abc123',
    outputDirectory: '.output',
    deploymentReadAttempts: 1,
    deploymentReadDelayMs: 0,
    wait: vi.fn().mockResolvedValue(undefined),
  }
}

describe('active production version parser', () => {
  it('selects the newest deployment rather than relying on array order', () => {
    const result = parseActiveProductionVersion(JSON.stringify([
      deployment(deployedVersion, '2026-07-27T04:00:00Z'),
      deployment(previousVersion, '2026-07-27T05:00:00Z'),
      deployment(externalVersion, '2026-07-27T03:00:00Z'),
    ]))

    expect(result).toEqual({ _tag: 'parsed', versionId: previousVersion })
  })

  it.each([
    ['invalid JSON', '{'],
    ['empty history', '[]'],
    ['invalid timestamp', JSON.stringify([deployment(previousVersion, 'later')])],
    ['split traffic', JSON.stringify([{
      ...deployment(previousVersion, '2026-07-27T05:00:00Z') as object,
      versions: [
        { version_id: previousVersion, percentage: 80 },
        { version_id: deployedVersion, percentage: 20 },
      ],
    }])],
  ])('rejects %s', (_label, stdout) => {
    expect(parseActiveProductionVersion(stdout)._tag).toBe('invalid')
  })
})

describe('production deployment rollback', () => {
  it('deploys and passes smoke without rollback', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
    const deps = dependencies(command)

    await expect(runProductionDeployment(deps)).resolves.toMatchObject({
      _tag: 'deployed',
      previousVersion,
      deployedVersion,
    })
    expect(deps.smoke).toHaveBeenCalledTimes(1)
    expect(command.mock.calls.map(call => call[0])).toEqual([
      ['--cwd', '.output', 'deployments', 'list', '--json'],
      ['--cwd', '.output', 'deploy'],
      ['--cwd', '.output', 'deployments', 'list', '--json'],
    ])
  })

  it('rolls back the explicit previous version and verifies recovery', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T07:00:00Z'),
      ))
    const smoke = vi.fn()
      .mockResolvedValueOnce(failedSmoke())
      .mockResolvedValueOnce(passedSmoke())

    const result = await runProductionDeployment(dependencies(command, smoke))

    expect(result).toMatchObject({
      _tag: 'rolled_back',
      previousVersion,
      failedVersion: deployedVersion,
    })
    expect(smoke).toHaveBeenCalledTimes(2)
    expect(command.mock.calls[4]![0]).toEqual([
      '--cwd',
      '.output',
      'rollback',
      previousVersion,
      '--message',
      'Automatic rollback after production smoke failure for abc123',
      '--yes',
    ])
  })

  it('refuses rollback if another deployment superseded the failed release', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(deployments(
        deployment(externalVersion, '2026-07-27T07:00:00Z'),
      ))

    await expect(runProductionDeployment(dependencies(
      command,
      vi.fn().mockResolvedValue(failedSmoke()),
    ))).resolves.toMatchObject({
      _tag: 'rollback_refused',
      reason: 'active_version_changed',
      failedVersion: deployedVersion,
      activeVersion: externalVersion,
    })
    expect(command).toHaveBeenCalledTimes(4)
    expect(command.mock.calls.flatMap(call => call[0])).not.toContain('rollback')
  })

  it('reports rollback command failure without claiming recovery', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce({
        _tag: 'failed',
        stdout: '',
        stderr: 'rollback denied',
        exitCode: 1,
      })

    await expect(runProductionDeployment(dependencies(
      command,
      vi.fn().mockResolvedValue(failedSmoke()),
    ))).resolves.toMatchObject({
      _tag: 'rollback_failed',
      reason: 'command_failed',
      failure: { exitCode: 1, stderr: 'rollback denied' },
    })
  })

  it('reports unhealthy recovery even after rollback succeeds', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T05:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(deployments(
        deployment(deployedVersion, '2026-07-27T06:00:00Z'),
      ))
      .mockResolvedValueOnce(commandPassed())
      .mockResolvedValueOnce(deployments(
        deployment(previousVersion, '2026-07-27T07:00:00Z'),
      ))
    const smoke = vi.fn()
      .mockResolvedValueOnce(failedSmoke())
      .mockResolvedValueOnce(failedSmoke())

    await expect(runProductionDeployment(dependencies(command, smoke))).resolves.toMatchObject({
      _tag: 'rollback_failed',
      reason: 'recovery_smoke_failed',
    })
  })

  it('fails closed before deployment when the rollback target is ambiguous', async () => {
    const command = vi.fn<ProductionCommand>()
      .mockResolvedValueOnce(deployments({
        ...deployment(previousVersion, '2026-07-27T05:00:00Z') as object,
        versions: [
          { version_id: previousVersion, percentage: 50 },
          { version_id: deployedVersion, percentage: 50 },
        ],
      }))

    await expect(runProductionDeployment(dependencies(command))).resolves.toMatchObject({
      _tag: 'capture_failed',
    })
    expect(command).toHaveBeenCalledTimes(1)
  })
})
