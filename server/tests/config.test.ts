import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(serverRoot, '..')
const tsx = resolve(workspaceRoot, 'node_modules', '.bin', 'tsx')
const probe = resolve(__dirname, 'config.probe.ts')

/**
 * Spawns config.probe.ts as a subprocess with a controlled environment.
 * Keys mapped to undefined are removed from the child env so the config
 * module sees them as truly absent (distinct from empty string).
 */
function runProbe(overrides: Record<string, string | undefined>) {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...process.env, ...overrides })) {
    if (v !== undefined) env[k] = v
  }
  return spawnSync(tsx, [probe], {
    cwd: serverRoot,
    env,
    encoding: 'utf8',
  })
}

describe('config validation', () => {
  it('scenario 1: JWT_SECRET absent in development/test → placeholder injected → exits 0', () => {
    // Remove JWT_SECRET entirely so the undefined-check in config.ts fires and
    // injects the dev/test placeholder, which is long enough to pass zod min(32).
    const result = runProbe({ NODE_ENV: 'test', JWT_SECRET: undefined })
    expect(result.status).toBe(0)
  })

  it('scenario 2: JWT_SECRET="" → exits 1 with "invalid environment variable values" mentioning JWT_SECRET', () => {
    // An empty string is defined (not undefined), so the placeholder is NOT
    // injected.  Zod emits a too_small error; the handler must surface it.
    const result = runProbe({ NODE_ENV: 'test', JWT_SECRET: '' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('invalid environment variable values')
    expect(result.stderr).toContain('JWT_SECRET')
  })

  it('scenario 3: JWT_SECRET with 32+ chars → exits 0', () => {
    const result = runProbe({
      NODE_ENV: 'test',
      JWT_SECRET: 'a-valid-secret-that-is-32-chars-x', // 33 chars
    })
    expect(result.status).toBe(0)
  })
})
