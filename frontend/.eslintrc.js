module.exports = {
  root: true,
  env: { node: true },
  ignorePatterns: ['metro.config.js', 'tailwind.config.js', 'coverage/'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    'react/react-in-jsx-scope': 'off',
    // XSS hardening: no way to turn a string into code or markup. Output is escaped by React.
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'react/no-danger': 'error',
    'react/no-danger-with-children': 'error',
    'react/jsx-no-script-url': 'error',
    'react/jsx-no-target-blank': 'error',
    'no-restricted-properties': [
      'error',
      { property: 'innerHTML', message: 'Sets markup from a string (XSS). Render React elements.' },
      { property: 'outerHTML', message: 'Sets markup from a string (XSS). Render React elements.' },
      { property: 'insertAdjacentHTML', message: 'Inserts markup from a string (XSS).' },
      { object: 'document', property: 'write', message: 'Writes markup from a string (XSS).' },
      { object: 'document', property: 'writeln', message: 'Writes markup from a string (XSS).' },
    ],
  },
  overrides: [
    {
      // The tests feed hostile strings such as `javascript:` to prove they are refused.
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: { 'no-script-url': 'off' },
    },
    {
      // Expo config plugins run in Node during prebuild and are loaded as CommonJS.
      files: ['plugins/**/*.js'],
      env: { jest: true },
      rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
};
