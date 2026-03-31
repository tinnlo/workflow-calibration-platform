import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { writeFileSync } from 'fs'

function netlifyHeadersPlugin(apiOrigin: string) {
  return {
    name: 'netlify-headers',
    closeBundle() {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self' ${apiOrigin}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ') + ';'

      const content = [
        '/*',
        '  X-Frame-Options: DENY',
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
        `  Content-Security-Policy: ${csp}`,
      ].join('\n') + '\n'

      writeFileSync(path.resolve('dist', '_headers'), content)
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_BASE_URL
  const isDeployedBuild = command === 'build' && (mode === 'production' || mode === 'staging')

  if (isDeployedBuild && !apiUrl) {
    throw new Error(
      'VITE_API_BASE_URL must be set for production/staging builds. ' +
      'Provide a bare HTTPS origin, e.g. "https://api.example.com".'
    )
  }

  if (apiUrl) {
    let url: URL
    try {
      url = new URL(apiUrl)
    } catch {
      throw new Error(`VITE_API_BASE_URL is not a valid URL: ${apiUrl}`)
    }

    if (url.origin !== apiUrl) {
      throw new Error(
        `VITE_API_BASE_URL must be a bare origin (e.g. "https://api.example.com"), got: "${apiUrl}"`
      )
    }

    if (isDeployedBuild) {
      if (url.protocol !== 'https:') {
        throw new Error(`VITE_API_BASE_URL must use HTTPS in production/staging builds, got: "${apiUrl}"`)
      }

      const h = url.hostname.toLowerCase().replace(/\.+$/, '')
      const isLocal =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '[::1]' ||
        h.endsWith('.localhost') ||
        h.endsWith('.local')
      if (isLocal) {
        throw new Error(`VITE_API_BASE_URL must not be a loopback/local origin in production/staging builds, got: "${apiUrl}"`)
      }
    }
  }

  return {
    server: {
      host: '::',
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT ?? 3001}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), ...(apiUrl ? [netlifyHeadersPlugin(apiUrl)] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            ui: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
            ],
            charts: ['recharts'],
            forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
            query: ['@tanstack/react-query'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  }
})
