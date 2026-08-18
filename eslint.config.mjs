import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  rules: {
    'vue/no-useless-v-bind': 'off',
    'vue/attribute-hyphenation': 'off',
    'ts/no-redeclare': 'off',
  },
}, ...harlanzw({ base: { type: 'app' } }))
