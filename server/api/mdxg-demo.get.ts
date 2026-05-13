import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Returns an MdxgDocument built from the repo's DESIGN.md so the /mdxg
// playground page can render a long-form document end-to-end.
export default defineEventHandler(async () => {
  const path = resolve(process.cwd(), 'DESIGN.md')
  const source = await readFile(path, 'utf-8')
  return parseMdxg(source)
})
