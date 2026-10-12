export interface StarsSyncResponse {
  importId?: string
  ok: true
  page: number
  fetched: number
  total: number
  matched: number
  hasMore: boolean
  syncedAt: number | null
}

interface StarsSyncRequest {
  method: 'POST'
  body: { page: number, importId?: string }
}

type StarsSyncFetch = (
  request: string,
  options: StarsSyncRequest,
) => Promise<StarsSyncResponse>

export async function syncStarredRepos(
  fetchPage: StarsSyncFetch,
  onPage?: (response: StarsSyncResponse) => void,
): Promise<StarsSyncResponse> {
  let importId: string | undefined
  for (let page = 1; page <= 10; page++) {
    const response = await fetchPage('/api/me/stars/sync', {
      method: 'POST',
      body: importId ? { page, importId } : { page },
    })
    importId = response.importId
    onPage?.(response)
    if (!response.hasMore)
      return response
  }

  throw new Error('Star sync exceeded the ten-page limit')
}
