/**
 * ESLint flat-config expansion:
 * - scripts (existing)
 * - typed OpenAPI barrel + explorer pure services (green seed for src/)
 * Vue SFCs / features UI / app-config remain gradual (unused-import debt).
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            '**/playwright-report/**',
            '**/test-results/**',
            'public/**',
            'e2e/**',
            'src/features/workspace/**',
            '!src/features/workspace/services/workspace-stateless-open.service.ts',
            '!src/features/workspace/services/workspace-platform-open.service.ts',
            '!src/features/workspace/utils/workspace-tab-dirty.ts',
            'src/features/connection/**',
            'src/features/team/**',
            'src/features/ai/**',
            'src/features/auth/**',
            'src/features/dashboard/**',
            'src/features/settings/**',
            'src/features/pack/**',
            'src/features/plugin/**',
            'src/features/community-plugin/**',
            'src/features/migration/**',
            'src/features/terminal/**',
            'src/features/datagen/**',
            'src/features/lineage/**',
            'src/features/explorer/components/**',
            'src/features/explorer/composables/**',
            'src/features/explorer/views/**',
            'src/features/explorer/services/**',
            '!src/features/explorer/services/connection-tree-helpers.ts',
            'src/app/**',
            'src/modules/**',
            'src/**/*.vue',
            // Gradual: dense type re-export hubs still noisy for no-unused-vars
            'src/shared/api/http/**',
            'src/shared/api/types.ts',
            'src/shared/api/platform.types.ts',
            'src/shared/api/ai.types.ts',
            'src/shared/config/**',
            'src/core/icons/**',
            'src/core/components/**',
            'src/core/composables/**',
            'src/i18n/**',
        ],
    },
    js.configs.recommended,
    {
        files: [
            'scripts/**/*.{mjs,js,cjs}',
            'eslint.config.mjs',
            'vitest.config.ts',
        ],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
                structuredClone: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}],
            'no-empty': ['error', {allowEmptyCatch: true}],
        },
    },
    {
        files: [
            'src/shared/api/generated/**/*.{ts,tsx}',
            'src/shared/api/explorer-ops.types.ts',
            'src/features/explorer/services/connection-tree-helpers.ts',
            'src/features/workspace/services/workspace-stateless-open.service.ts',
            'src/features/workspace/services/workspace-platform-open.service.ts',
            'src/features/workspace/utils/workspace-tab-dirty.ts',
            'src/core/utils/**/*.{ts,tsx}',
        ],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
            ],
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-unused-vars': 'off',
        },
    },
)
