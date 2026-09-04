import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  rules: {
    'vue/no-useless-v-bind': 'off',
    'vue/attribute-hyphenation': 'off',
    'ts/no-redeclare': 'off',
  },
}, ...harlanzw({ base: { type: 'app' } }), {
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
    ],
  },
})
