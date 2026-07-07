import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Compiler-era rules that flag the fetch-in-effect and CodeMirror-ref
      // patterns used throughout the views. Kept visible as warnings until
      // those are reworked; not worth blocking CI on.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      // DX-only (fast refresh falls back to a full reload); fires on stock
      // shadcn ui files that export variants/hooks alongside components.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
