import type { ProductionSmokeResult } from './production-smoke'

export type ProductionCommandResult
  = | { _tag: 'passed', stdout: string, stderr: string }
    | { _tag: 'failed', stdout: string, stderr: string, exitCode: number }

export type ProductionCommand = (args: string[]) => Promise<ProductionCommandResult>

export interface ProductionDeployDependencies {
  command: ProductionCommand
  smoke: () => Promise<ProductionSmokeResult>
  releaseSha: string
  outputDirectory?: string
  deploymentReadAttempts?: number
  deploymentReadDelayMs?: number
  wait?: (milliseconds: number) => Promise<void>
}

export type ActiveVersionParseResult
  = | { _tag: 'parsed', versionId: string }
    | {
      _tag: 'invalid'
      reason: 'invalid_json' | 'invalid_history' | 'empty_history' | 'ambiguous_deployment'
      detail: string
    }

interface CommandFailure {
  exitCode: number
  stderr: string
}

type ActiveVersionReadFailure
  = | { _tag: 'command_failed', failure: CommandFailure }
    | { _tag: 'invalid_response', parse: Extract<ActiveVersionParseResult, { _tag: 'invalid' }> }

export type ProductionDeployResult
  = | {
    _tag: 'capture_failed'
    failure: ActiveVersionReadFailure
  }
  | {
    _tag: 'deploy_failed'
    previousVersion: string
    failure: CommandFailure
  }
  | {
    _tag: 'deployment_unconfirmed'
    previousVersion: string
    failure: ActiveVersionReadFailure | { _tag: 'unexpected_version', versionId: string }
  }
  | {
    _tag: 'deployed'
    previousVersion: string
    deployedVersion: string
    smoke: Extract<ProductionSmokeResult, { _tag: 'passed' }>
  }
  | {
    _tag: 'rollback_refused'
    reason: 'active_version_changed'
    previousVersion: string
    failedVersion: string
    activeVersion: string
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
  }
  | {
    _tag: 'rollback_refused'
    reason: 'active_version_unavailable'
    previousVersion: string
    failedVersion: string
    failure: ActiveVersionReadFailure
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
  }
  | {
    _tag: 'rollback_failed'
    reason: 'command_failed'
    previousVersion: string
    failedVersion: string
    failure: CommandFailure
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
  }
  | {
    _tag: 'rollback_failed'
    reason: 'recovery_version_unconfirmed'
    previousVersion: string
    failedVersion: string
    failure: ActiveVersionReadFailure | { _tag: 'unexpected_version', versionId: string }
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
  }
  | {
    _tag: 'rollback_failed'
    reason: 'recovery_smoke_failed'
    previousVersion: string
    failedVersion: string
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
    recoverySmoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
  }
  | {
    _tag: 'rolled_back'
    previousVersion: string
    failedVersion: string
    smoke: Extract<ProductionSmokeResult, { _tag: 'failed' }>
    recoverySmoke: Extract<ProductionSmokeResult, { _tag: 'passed' }>
  }

interface DeploymentVersion {
  version_id: string
  percentage: number
}

interface Deployment {
  created_on: string
  versions: DeploymentVersion[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDeployment(value: unknown): Deployment | null {
  if (!isRecord(value)
    || typeof value.created_on !== 'string'
    || !Number.isFinite(Date.parse(value.created_on))
    || !Array.isArray(value.versions)) {
    return null
  }
  const versions = value.versions.map((version): DeploymentVersion | null => {
    if (!isRecord(version)
      || typeof version.version_id !== 'string'
      || version.version_id.length === 0
      || typeof version.percentage !== 'number'
      || !Number.isFinite(version.percentage)) {
      return null
    }
    return {
      version_id: version.version_id,
      percentage: version.percentage,
    }
  })
  if (versions.includes(null))
    return null
  return {
    created_on: value.created_on,
    versions: versions as DeploymentVersion[],
  }
}

function parseJson(value: string):
  | { _tag: 'parsed', value: unknown }
  | { _tag: 'invalid' } {
  try {
    return { _tag: 'parsed', value: JSON.parse(value) }
  }
  catch {
    return { _tag: 'invalid' }
  }
}

export function parseActiveProductionVersion(stdout: string): ActiveVersionParseResult {
  const json = parseJson(stdout)
  if (json._tag === 'invalid') {
    return {
      _tag: 'invalid',
      reason: 'invalid_json',
      detail: 'Wrangler deployment history was not valid JSON',
    }
  }
  if (!Array.isArray(json.value)) {
    return {
      _tag: 'invalid',
      reason: 'invalid_history',
      detail: 'Wrangler deployment history was not an array',
    }
  }
  if (json.value.length === 0) {
    return {
      _tag: 'invalid',
      reason: 'empty_history',
      detail: 'Worker has no deployment history',
    }
  }
  const history = json.value.map(parseDeployment)
  if (history.includes(null)) {
    return {
      _tag: 'invalid',
      reason: 'invalid_history',
      detail: 'Wrangler deployment history contained an invalid deployment',
    }
  }
  const active = (history as Deployment[]).toSorted((left, right) =>
    Date.parse(right.created_on) - Date.parse(left.created_on))[0]!
  if (active.versions.length !== 1 || active.versions[0]!.percentage !== 100) {
    return {
      _tag: 'invalid',
      reason: 'ambiguous_deployment',
      detail: 'Latest deployment must have exactly one version at 100% traffic',
    }
  }
  return {
    _tag: 'parsed',
    versionId: active.versions[0]!.version_id,
  }
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function commandFailure(
  result: Extract<ProductionCommandResult, { _tag: 'failed' }>,
): CommandFailure {
  return {
    exitCode: result.exitCode,
    stderr: result.stderr,
  }
}

async function readActiveVersion(
  dependencies: ProductionDeployDependencies,
  outputDirectory: string,
): Promise<
  | { _tag: 'read', versionId: string }
  | ActiveVersionReadFailure
> {
  const result = await dependencies.command([
    '--cwd',
    outputDirectory,
    'deployments',
    'list',
    '--json',
  ])
  if (result._tag === 'failed') {
    return {
      _tag: 'command_failed',
      failure: commandFailure(result),
    }
  }
  const parsed = parseActiveProductionVersion(result.stdout)
  if (parsed._tag === 'invalid')
    return { _tag: 'invalid_response', parse: parsed }
  return { _tag: 'read', versionId: parsed.versionId }
}

async function waitForActiveVersion(
  dependencies: ProductionDeployDependencies,
  outputDirectory: string,
  accepts: (versionId: string) => boolean,
): Promise<
  | { _tag: 'confirmed', versionId: string }
  | {
    _tag: 'unconfirmed'
    failure: ActiveVersionReadFailure | { _tag: 'unexpected_version', versionId: string }
  }
> {
  const attempts = Math.max(1, Math.floor(dependencies.deploymentReadAttempts ?? 10))
  const delayMs = Math.max(0, Math.floor(dependencies.deploymentReadDelayMs ?? 1_000))
  const wait = dependencies.wait ?? waitFor
  let latestFailure: ActiveVersionReadFailure | { _tag: 'unexpected_version', versionId: string }
    = {
      _tag: 'invalid_response',
      parse: {
        _tag: 'invalid',
        reason: 'empty_history',
        detail: 'No deployment read attempted',
      },
    }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const current = await readActiveVersion(dependencies, outputDirectory)
    if (current._tag === 'read') {
      if (accepts(current.versionId))
        return { _tag: 'confirmed', versionId: current.versionId }
      latestFailure = { _tag: 'unexpected_version', versionId: current.versionId }
    }
    else {
      latestFailure = current
    }
    if (attempt < attempts)
      await wait(delayMs)
  }
  return { _tag: 'unconfirmed', failure: latestFailure }
}

export async function runProductionDeployment(
  dependencies: ProductionDeployDependencies,
): Promise<ProductionDeployResult> {
  const outputDirectory = dependencies.outputDirectory ?? '.output'
  const captured = await readActiveVersion(dependencies, outputDirectory)
  if (captured._tag !== 'read')
    return { _tag: 'capture_failed', failure: captured }
  const previousVersion = captured.versionId

  const deploy = await dependencies.command(['--cwd', outputDirectory, 'deploy'])
  if (deploy._tag === 'failed') {
    return {
      _tag: 'deploy_failed',
      previousVersion,
      failure: commandFailure(deploy),
    }
  }

  const deployed = await waitForActiveVersion(
    dependencies,
    outputDirectory,
    versionId => versionId !== previousVersion,
  )
  if (deployed._tag === 'unconfirmed') {
    return {
      _tag: 'deployment_unconfirmed',
      previousVersion,
      failure: deployed.failure,
    }
  }
  const deployedVersion = deployed.versionId
  const smoke = await dependencies.smoke()
  if (smoke._tag === 'passed') {
    return {
      _tag: 'deployed',
      previousVersion,
      deployedVersion,
      smoke,
    }
  }

  const current = await readActiveVersion(dependencies, outputDirectory)
  if (current._tag !== 'read') {
    return {
      _tag: 'rollback_refused',
      reason: 'active_version_unavailable',
      previousVersion,
      failedVersion: deployedVersion,
      failure: current,
      smoke,
    }
  }
  if (current.versionId !== deployedVersion) {
    return {
      _tag: 'rollback_refused',
      reason: 'active_version_changed',
      previousVersion,
      failedVersion: deployedVersion,
      activeVersion: current.versionId,
      smoke,
    }
  }

  const rollback = await dependencies.command([
    '--cwd',
    outputDirectory,
    'rollback',
    previousVersion,
    '--message',
    `Automatic rollback after production smoke failure for ${dependencies.releaseSha}`,
    '--yes',
  ])
  if (rollback._tag === 'failed') {
    return {
      _tag: 'rollback_failed',
      reason: 'command_failed',
      previousVersion,
      failedVersion: deployedVersion,
      failure: commandFailure(rollback),
      smoke,
    }
  }

  const recovered = await waitForActiveVersion(
    dependencies,
    outputDirectory,
    versionId => versionId === previousVersion,
  )
  if (recovered._tag === 'unconfirmed') {
    return {
      _tag: 'rollback_failed',
      reason: 'recovery_version_unconfirmed',
      previousVersion,
      failedVersion: deployedVersion,
      failure: recovered.failure,
      smoke,
    }
  }

  const recoverySmoke = await dependencies.smoke()
  if (recoverySmoke._tag === 'failed') {
    return {
      _tag: 'rollback_failed',
      reason: 'recovery_smoke_failed',
      previousVersion,
      failedVersion: deployedVersion,
      smoke,
      recoverySmoke,
    }
  }
  return {
    _tag: 'rolled_back',
    previousVersion,
    failedVersion: deployedVersion,
    smoke,
    recoverySmoke,
  }
}
