import { clientFiles, countCase } from '../output.mjs'

// Number of client JavaScript chunks. A lost code split moves this down, a
// page that splits into many small requests moves it up.
countCase(root => clientFiles(root).filter(path => path.endsWith('.js')).length)
