/**
 * Stand-in for the `#ai-ready-virtual/i18n-runtime.mjs` virtual the
 * nuxt-ai-ready module generates from nuxtseo-shared at build time. Locale
 * resolution only runs when the module's i18n config is set, which tests
 * loading the runtime dist files don't do; the exports throw so that stays
 * true loudly.
 */

export function resolveLocaleFromRoute(): never {
  throw new Error('#ai-ready-virtual/i18n-runtime.mjs stub: i18n is not available in tests')
}

export function resolveI18nDomain(): never {
  throw new Error('#ai-ready-virtual/i18n-runtime.mjs stub: i18n is not available in tests')
}
