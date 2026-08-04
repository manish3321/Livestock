import base from '@farm/eslint-config';

export default [
  ...base,
  {
    // Test fakes intentionally mirror Prisma's loosely-typed call sites.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
