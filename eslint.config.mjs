import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  rules: {
    'vue/no-useless-v-bind': 'off',
    'vue/attribute-hyphenation': 'off',
    'ts/no-redeclare': 'off',
  },
}, ...harlanzw({ base: { type: 'app' } }), {
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
