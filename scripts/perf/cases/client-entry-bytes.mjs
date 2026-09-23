import { bytes, countCase, entryFile } from '../output.mjs'

// Bytes of the client entry chunk. Every page loads it before it can hydrate.
countCase(root => bytes([entryFile(root)]))
