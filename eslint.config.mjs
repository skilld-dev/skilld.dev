import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  // skilld sync writes .skills from skilld-dev/skilld. CI checks it with check:skills.
  // Immutable research exports and recorded evaluation documents keep their original bytes.
  ignores: ['.skills/**', 'public/research/**/measurements.json', 'docs/evals/writing-*/*/{reading-list,README,pr}.md'],
  rules: {
    'vue/no-useless-v-bind': 'off',
    'vue/attribute-hyphenation': 'off',
    'ts/no-redeclare': 'off',
  },
}, ...harlanzw({ base: { type: 'app' } }), {
  // Browsers that load the client still lack the ES2023 array copies, and one
  // call broke the homepage there (Sentry SKILLD-4P). The first five entries
  // repeat antfu's defaults, since a rule override replaces the whole list.
  files: ['app/**', 'layers/*/app/**'],
  name: 'skilld/client-array-copies',
  rules: {
    'no-restricted-properties': [
      'error',
      { property: '__proto__', message: 'Use `Object.getPrototypeOf` or `Object.setPrototypeOf` instead.' },
      { property: '__defineGetter__', message: 'Use `Object.defineProperty` instead.' },
      { property: '__defineSetter__', message: 'Use `Object.defineProperty` instead.' },
      { property: '__lookupGetter__', message: 'Use `Object.getOwnPropertyDescriptor` instead.' },
      { property: '__lookupSetter__', message: 'Use `Object.getOwnPropertyDescriptor` instead.' },
      ...['toSorted', 'toReversed', 'toSpliced'].map(property => ({
        property,
        message: 'Older browsers that load the client lack this ES2023 method. Copy the array first, for example `[...items].sort()`.',
      })),
    ],
  },
}, {
  // The isolated proof needs Container 1.0 tooling. The site keeps its version.
  files: ['pnpm-workspace.yaml'],
  rules: {
    'pnpm/yaml-no-duplicate-catalog-item': ['error', { checkDuplicates: 'exact-version' }],
  },
}, {
  // Server code runs on workerd, which accepts only the `follow` and `manual`
  // redirect modes. Node's undici also accepts `error`, so the unit suite
  // cannot catch it: every hosted Artifact build failed from 2026-08-21 to
  // 2026-09-01 on one such fetch. The first two selectors repeat antfu's
  // defaults, since a rule override replaces the whole option list.
  files: ['layers/**/server/**/*.ts', 'server/**/*.ts', 'shared/**/*.ts', 'workers/**/*.ts'],
  name: 'skilld/workerd-fetch-redirect',
  rules: {
    'no-restricted-syntax': [
      'error',
      'TSEnumDeclaration[const=true]',
      'TSExportAssignment',
      {
        selector: 'Property[key.name="redirect"] > Literal[value="error"], Property[key.value="redirect"] > Literal[value="error"]',
        message: 'workerd rejects redirect: \'error\'; use fetchNoRedirect()',
      },
      // On a request with no session, h3 mints one and sets its cookie, and a
      // response that sets a cookie is never stored by a shared cache.
      {
        selector: 'CallExpression[callee.name="getUserSession"]',
        message: 'getUserSession() sets a session cookie on anonymous requests; use readUserSession() from #shared/server/session-access',
      },
    ],
  },
})
