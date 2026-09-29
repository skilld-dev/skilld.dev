/**
 * The collection names `icon.collections` in nuxt.config.ts must list.
 *
 * With `serverBundle: false` and no API fallback, @nuxt/icon registers no
 * collection names, so it splits `i-vscode-icons-foo` at the first hyphen and
 * looks up collection `vscode`. The icon never resolves: SSR ships a bare class
 * and logs a warning. Naming every installed collection fixes the split.
 *
 * Only `dependencies` count. An `@iconify-json/*` package that slips into
 * `devDependencies` silently drops its collection here, which is exactly the
 * failure above, so every icon package this site renders with must stay a
 * runtime dependency.
 */

const ICONIFY_PREFIX = '@iconify-json/'

export interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function iconifyCollections(pkg: PackageManifest): string[] {
  return Object.keys(pkg.dependencies ?? {})
    .filter(name => name.startsWith(ICONIFY_PREFIX))
    .map(name => name.slice(ICONIFY_PREFIX.length))
}
