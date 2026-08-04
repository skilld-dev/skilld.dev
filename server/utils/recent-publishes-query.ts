export interface OfficialOwnerFilter {
  sql: 'a.owner IN (SELECT value FROM json_each(?))'
  params: [string]
}

export function buildOfficialOwnerFilter(owners: readonly string[]): OfficialOwnerFilter {
  const uniqueOwners = [...new Set(owners)]
  return {
    sql: 'a.owner IN (SELECT value FROM json_each(?))',
    params: [JSON.stringify(uniqueOwners)],
  }
}
