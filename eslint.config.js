import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/sw.js', 'src-tauri/target/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
];
