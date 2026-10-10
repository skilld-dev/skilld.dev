export type PnpmPackage
  = | { _tag: 'Found', package: string, version: string, skill: string }
    | { _tag: 'Absent' }
    | { _tag: 'Unavailable' }
