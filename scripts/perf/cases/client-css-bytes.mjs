import { bytes, clientFiles, countCase } from '../output.mjs'

// Total bytes of the client CSS this build produced.
//
// Exact on a cold build, which is what CI exports before it measures. A warm
// local skew-protection cache restores old hashed CSS that no build metadata
// names, so a count read on a warm checkout can include earlier deploys.
countCase(root => bytes(clientFiles(root).filter(path => path.endsWith('.css'))))
