import lexicon from '../../utils/atproto/lexicons/dev.skilld.collection.json'

/** Serve the formal lexicon schema so other AT Protocol apps can discover and validate records. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/json')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return lexicon
})
