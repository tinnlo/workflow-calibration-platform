import { config as loadEnv } from 'dotenv'
import { z } from 'zod'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (!process.env.NODE_ENV) {
  console.error('Configuration error: NODE_ENV must be set explicitly (development | test | staging | production).')
  process.exit(1)
}
const nodeEnv = process.env.NODE_ENV

// Load .env file only in development/test — production/staging read from system environment
if (nodeEnv === 'development' || nodeEnv === 'test') {
  const envFiles = [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env']
  for (const envFile of envFiles) {
    const envPath = resolve(__dirname, '..', envFile)
    if (existsSync(envPath)) {
      loadEnv({ path: envPath })
      break
    }
  }

  // Provide a well-known insecure default so clean checkouts start without a
  // server/.env file.  Production/staging must supply a real secret — the
  // guard in validateConfig() rejects this value in deployed environments.
  // Use strict undefined check: an explicitly empty value (e.g. JWT_SECRET=
  // copied from the example file) must not be silently replaced — it should
  // reach zod validation and be rejected with a configuration error.
  if (process.env.JWT_SECRET === undefined) {
    process.env.JWT_SECRET = 'dev-test-only-insecure-placeholder-do-not-deploy'
  }
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']),
  PORT: z.coerce.number().default(3001),

  // CORS and Security
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .default('http://localhost:5173,http://localhost:5174'),

  // JWT Authentication
  JWT_SECRET: z
    .string()
    .min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_ISSUER: z.string().default('calibration-platform'),
  JWT_AUDIENCE: z.string().default('calibration-platform-api'),
})

type Config = z.infer<typeof configSchema>

function validateConfig(): Config {
  try {
    const parsed = configSchema.parse(process.env)

    // Fail-fast: deployed environments must not use any known-insecure JWT secret.
    // The set covers the value previously published in git history and the current
    // dev/test placeholder injected above — both are well-known and must never sign
    // production tokens.
    const KNOWN_INSECURE_JWT_SECRETS = new Set([
      'dev-only-secret-min-32-chars-change-in-production',
      'dev-test-only-insecure-placeholder-do-not-deploy',
    ])
    const isDeployedEnv = parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'staging'
    if (isDeployedEnv && KNOWN_INSECURE_JWT_SECRETS.has(parsed.JWT_SECRET)) {
      console.error('Configuration error: JWT_SECRET is set to a known-insecure placeholder value.')
      console.error('Generate a secure secret with: openssl rand -base64 32')
      process.exit(1)
    }

    if (isDeployedEnv) {
      const normalizedOrigins: string[] = []
      for (const origin of parsed.CORS_ORIGINS) {
        let url: URL
        try {
          url = new URL(origin)
        } catch {
          console.error(`Configuration error: CORS_ORIGINS contains unparsable entry "${origin}" in production/staging.`)
          process.exit(1)
        }

        const bareOrigin = url.origin
        if (origin !== bareOrigin) {
          console.error(
            `Configuration error: CORS_ORIGINS entry "${origin}" is not a bare origin.` +
            ` Use "${bareOrigin}" (no path, query, hash, or userinfo).`
          )
          process.exit(1)
        }

        const h = url.hostname.toLowerCase().replace(/\.+$/, '')
        const isLocal =
          h === 'localhost' ||
          h === '127.0.0.1' ||
          h === '[::1]' ||
          h.endsWith('.localhost') ||
          h.endsWith('.local')
        if (isLocal) {
          console.error('Configuration error: CORS_ORIGINS must not contain loopback/local origins in production/staging.')
          process.exit(1)
        }

        if (url.protocol !== 'https:') {
          console.error(`Configuration error: CORS_ORIGINS must use HTTPS in production/staging (found: ${origin}).`)
          process.exit(1)
        }

        normalizedOrigins.push(bareOrigin)
      }
      // Deduplicate and store
      ;(parsed as any).CORS_ORIGINS = [...new Set(normalizedOrigins)]
    }

    return parsed
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .filter((e) => e.code === 'invalid_type' && e.received === 'undefined')
        .map((e) => e.path.join('.'))
      const invalid = error.errors
        .filter((e) => !(e.code === 'invalid_type' && e.received === 'undefined'))
        .map((e) => `${e.path.join('.')}: ${e.message}`)
      if (missing.length > 0) {
        console.error('Configuration error: missing required environment variables:', missing)
      }
      if (invalid.length > 0) {
        console.error('Configuration error: invalid environment variable values:', invalid)
      }
      process.exit(1)
    }
    throw error
  }
}

export const config = validateConfig()
export const { NODE_ENV, PORT, CORS_ORIGINS, JWT_SECRET, JWT_ACCESS_EXPIRY, JWT_ISSUER, JWT_AUDIENCE } = config
