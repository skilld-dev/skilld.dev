import lexicon from '../../utils/atproto/lexicons/dev.skilld.collection.save.json'

/** Serve the save lexicon schema for AT Protocol discovery. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/json')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return lexicon
})
