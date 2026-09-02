// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  prettier,
  {
    rules: {
      'vue/no-multiple-template-root': 'off'
    }
  }
)
