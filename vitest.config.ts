import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@components': resolve(import.meta.dirname, 'src/components'),
      '@assets': resolve(import.meta.dirname, 'src/assets'),
      '@constants': resolve(import.meta.dirname, 'src/constants'),
      '@utils': resolve(import.meta.dirname, 'src/utils'),
      '@i18n': resolve(import.meta.dirname, 'src/i18n'),
      '@layouts': resolve(import.meta.dirname, 'src/layouts'),
      '@server': resolve(import.meta.dirname, 'src/server'),
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
