import { bytes, clientFiles, countCase } from '../output.mjs'

// Total bytes of the client CSS this build produced.
countCase(root => bytes(clientFiles(root).filter(path => path.endsWith('.css'))))
