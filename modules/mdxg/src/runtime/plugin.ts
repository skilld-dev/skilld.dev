// Register the Nuxt-bundled Shiki highlighter as parseMdxg's default. The
// virtual `#mdc-highlighter` module is provided by @nuxtjs/mdc and contains
// the bundled language/theme set the consumer configured under `mdc.highlight`
// in their nuxt.config. Without this plugin, server-side parseMdxg calls would
// silently fall through to a 404'd /api/_mdc/highlight endpoint and emit raw
// (unhighlighted) code blocks.
import mdcHighlighter from '#mdc-highlighter'
import { setMdxgDefaultHighlighter } from './utils/mdxg'

export default defineNuxtPlugin({
  name: 'mdxg:highlighter',
  enforce: 'pre',
  setup() {
    setMdxgDefaultHighlighter(mdcHighlighter as never)
  },
})
