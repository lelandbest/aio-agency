import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  // Main configuration
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['*/backendApi'],
            message: 'Direct imports from backendApi are forbidden in UI modules. Use the corresponding Service from /services instead (e.g. MediaService, FormsService, CrmService, etc.). Utility functions (getApiBaseUrl, withSessionToken, toSnakeCase, normalizeSourceUrl, request) are re-exported from their respective service files.',
          },
        ],
      }],
    },
  },
  // Service layer is allowed to import from backendApi
  {
    files: ['src/services/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]

