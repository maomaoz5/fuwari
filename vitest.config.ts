import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@components': resolve(__dirname, 'src/components'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@constants': resolve(__dirname, 'src/constants'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@i18n': resolve(__dirname, 'src/i18n'),
      '@layouts': resolve(__dirname, 'src/layouts'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
