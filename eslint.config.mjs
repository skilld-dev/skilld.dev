import antfu from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'

export default antfu({
  rules: {
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    'vue/no-useless-v-bind': 'off',
    'vue/attribute-hyphenation': 'off',
  },
  ignores: [
    '.data/**',
  ],
}, ...harlanzw())
