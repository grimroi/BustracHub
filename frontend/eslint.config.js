import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: [
      '**/*.{test,spec}.{js,jsx}',
      '**/__tests__/**/*.{js,jsx}',
      'src/setupTests.js',
      'jest.setup.js',
      'jest.config.cjs',
      'babel.config.cjs',
    ],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
  },
])
