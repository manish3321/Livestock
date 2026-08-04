import base from './index.mjs';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Shared ESLint flat config for React (web) packages. */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
