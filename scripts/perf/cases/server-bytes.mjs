import { bytes, countCase, serverFiles } from '../output.mjs'

// Total bytes of the Worker bundle in .output/server, source maps left out.
countCase(root => bytes(serverFiles(root)))
