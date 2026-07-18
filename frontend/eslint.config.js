import tseslint from 'typescript-eslint';

export default tseslint.config({
  ignores: ['dist/**', 'node_modules/**'],
  files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname
    }
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/typedef': ['error', { arrowParameter: true, parameter: true }]
  }
});
