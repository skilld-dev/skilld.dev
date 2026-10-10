import type { PnpmPackage } from '../../shared/pnpm-package'

export function presentPnpmPackage(result: PnpmPackage): PnpmPackage {
  return result._tag === 'Found'
    ? { _tag: 'Found', package: result.package, version: result.version, skill: result.skill }
    : { _tag: result._tag }
}
