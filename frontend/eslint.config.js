import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
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
      '@typescript-eslint/typedef': ['error', {
        arrowParameter: true,
        parameter: true
      }]
    }
  },
  {
    // TypeScript already supplies precise contextual types for React handlers,
    // array callbacks, and state-updater callbacks in the analysis workspace.
    // Repeating those types makes the editor code harder to maintain without
    // adding type safety, so keep declarations explicit while allowing inferred
    // arrow-function parameters only inside this feature boundary.
    files: [
      'src/analysis/**/*.{ts,tsx}',
      'src/pages/Explore*.tsx',
      'src/pages/Analysis*.tsx',
      'src/pages/EventTypeChartsPage.tsx'
    ],
    rules: {
      '@typescript-eslint/typedef': ['error', {
        arrowParameter: false,
        parameter: true
      }]
    }
  }
);
