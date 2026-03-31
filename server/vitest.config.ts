import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    env: {
      NODE_ENV: 'development',
      JWT_SECRET: 'test-secret-at-least-32-chars-long-xyz',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_ISSUER: 'calibration-platform',
      JWT_AUDIENCE: 'calibration-platform-api',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
