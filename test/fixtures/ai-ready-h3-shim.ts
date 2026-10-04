/**
 * Stand-in for the `#nuxtseo/h3` virtual the nuxt-ai-ready module injects at
 * build time. Tests that load the module's runtime dist files directly alias
 * this specifier here; the module's own runtime API is h3's, so re-export it.
 */

export * from 'h3'
