export const SENTRY_DSN = 'https://b275b367f8096d04db8c2ebcfadc3aba@o4510507748163584.ingest.us.sentry.io/4511781692506112'

export function createSentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: false,
      response: false,
    },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: {
      document: false,
      variables: false,
    },
    genAI: {
      inputs: false,
      outputs: false,
    },
    databaseQueryData: false,
    stackFrameVariables: false,
  }
}
