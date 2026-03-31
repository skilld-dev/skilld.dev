import type { LiteClient, SearchQuery, SearchResponse } from 'algoliasearch/lite'
import {
  liteClient as algoliasearch,

} from 'algoliasearch/lite'

let _client: LiteClient | null = null

function getClient(appId: string, apiKey: string): LiteClient {
  if (!_client) {
    _client = algoliasearch(appId, apiKey)
  }
  return _client
}

export interface NpmPackageHit {
  name: string
  version: string
  description: string | null
  downloadsLast30Days: number
  popular: boolean
  keywords: string[]
  deprecated: boolean | string
  isDeprecated: boolean
  license: string | null
  owners: { name: string, email?: string }[] | null
}

const ATTRIBUTES_TO_RETRIEVE = [
  'name',
  'version',
  'description',
  'downloadsLast30Days',
  'popular',
  'keywords',
  'deprecated',
  'isDeprecated',
  'license',
  'owners',
]

export interface NpmSearchResult {
  name: string
  version: string
  description: string
  weeklyDownloads: number
  popular: boolean
  deprecated: boolean
  license: string | null
}

export interface NpmSearchResponse {
  results: NpmSearchResult[]
  total: number
}

function hitToResult(hit: NpmPackageHit): NpmSearchResult {
  return {
    name: hit.name,
    version: hit.version,
    description: hit.description || '',
    weeklyDownloads: Math.round(hit.downloadsLast30Days / 4.3),
    popular: hit.popular,
    deprecated: !!hit.deprecated || hit.isDeprecated,
    license: hit.license,
  }
}

export function useNpmSearch() {
  const config = useRuntimeConfig()
  const algolia = config.public.algolia as { appId: string, apiKey: string, indexName: string }
  const client = getClient(algolia.appId, algolia.apiKey)

  async function search(query: string, options: { size?: number, offset?: number } = {}): Promise<NpmSearchResponse> {
    const { results } = await client.search({
      requests: [
        {
          indexName: algolia.indexName,
          query,
          offset: options.offset ?? 0,
          length: options.size ?? 20,
          analyticsTags: ['skilld.dev'],
          attributesToRetrieve: ATTRIBUTES_TO_RETRIEVE,
          attributesToHighlight: [],
        } satisfies SearchQuery,
      ],
    })

    const response = results[0] as SearchResponse<NpmPackageHit> | undefined
    if (!response) {
      return { results: [], total: 0 }
    }

    return {
      results: response.hits.map(hitToResult),
      total: response.nbHits ?? 0,
    }
  }

  return { search }
}
