import { countCase, gzipBytes, serverFiles } from '../output.mjs'

// Gzip bytes of the Worker bundle. Cloudflare applies its Worker size limit to
// the compressed upload, so this is the number that can block a deploy. The
// entry file itself is a 2 KB shim that imports every chunk, so it counts all
// of them.
countCase(root => gzipBytes(serverFiles(root)))
