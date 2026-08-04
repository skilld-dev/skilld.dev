export interface StarsSyncResponse {
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
  body: { page: number }
}

type StarsSyncFetch = (
  request: string,
  options: StarsSyncRequest,
) => Promise<StarsSyncResponse>

export async function syncStarredRepos(
  fetchPage: StarsSyncFetch,
  onPage?: (response: StarsSyncResponse) => void,
): Promise<StarsSyncResponse> {
  for (let page = 1; page <= 10; page++) {
    const response = await fetchPage('/api/me/stars/sync', {
      method: 'POST',
      body: { page },
    })
    onPage?.(response)
    if (!response.hasMore)
      return response
  }

  throw new Error('Star sync exceeded the ten-page limit')
}
