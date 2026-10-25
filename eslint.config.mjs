// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  prettier,
  {
    rules: {
      'vue/no-multiple-template-root': 'off'
    }
  },
  {
    files: ['app/components/**/*.vue'],
    rules: {
      // 3D scene objects and the die, no clash with HTML elements
      'vue/multi-word-component-names': ['error', { ignores: ['Planet', 'Ship', 'Hyperlanes', 'Die'] }]
    }
  }
)
