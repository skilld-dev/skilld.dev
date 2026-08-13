interface ClusterIndexRowIdentity {
  owner: string
  repo: string
  name: string
}

export type ClusterIndexSelector = 'category' | 'pinned'

export type ClusterIndexQuery<Row extends ClusterIndexRowIdentity> = (
  selector: ClusterIndexSelector,
  values: string[],
) => Promise<Row[]>

// D1 accepts at most 100 bound parameters in one query.
const D1_BOUND_PARAMETER_LIMIT = 100

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  )
}

export async function findClusterIndexRows<Row extends ClusterIndexRowIdentity>(
  query: ClusterIndexQuery<Row>,
  categories: string[],
  pinnedSkills: string[],
): Promise<Row[]> {
  const groups: [ClusterIndexSelector, string[]][] = [
    ...chunks(categories, D1_BOUND_PARAMETER_LIMIT).map<[ClusterIndexSelector, string[]]>(values => ['category', values]),
    ...chunks(pinnedSkills, D1_BOUND_PARAMETER_LIMIT).map<[ClusterIndexSelector, string[]]>(values => ['pinned', values]),
  ]
  const rows: Row[] = []

  for (const [selector, values] of groups)
    rows.push(...await query(selector, values))

  return Array.from(
    new Map(rows.map(row => [`${row.owner}/${row.repo}/${row.name}`, row])).values(),
  )
}
