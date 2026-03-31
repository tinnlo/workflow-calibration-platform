import { test, expect } from '@playwright/test'

const DEMO_EMAIL = 'admin@apex.example'
const DEMO_PASSWORD = 'Demo1234!'
const RESET_URL = 'http://localhost:3002/api/test/reset'

// Reset server to a clean seed state before every test.
// This gives full per-test isolation: mutations from one test cannot leak
// into the next, regardless of whether the dev server was reused.
test.beforeEach(async () => {
  const res = await fetch(RESET_URL, { method: 'POST' })
  if (!res.ok) throw new Error(`E2E reset failed: ${res.status} ${await res.text()}`)
})

test.describe('Smoke — authentication', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login with valid credentials redirects to /dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', DEMO_EMAIL)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('login with invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', DEMO_EMAIL)
    await page.fill('input[type="password"]', 'wrong-password')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Smoke — dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Log in before each test
    await page.goto('/login')
    await page.fill('input[type="email"]', DEMO_EMAIL)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('dashboard shows workflow list', async ({ page }) => {
    // Seeded data: 5 workflows for org-apex
    const rows = page.locator('a[href^="/workflows/"]')
    await expect(rows).toHaveCount(5, { timeout: 8_000 })
  })

  test('can open New Workflow dialog', async ({ page }) => {
    await page.click('button:has-text("New Workflow")')
    await expect(page.locator('text=New Workflow').nth(1)).toBeVisible()
  })

  test('can create a new workflow and navigate to it', async ({ page }) => {
    await page.click('button:has-text("New Workflow")')
    await page.fill('input#newTitle', 'E2E Smoke Test Workflow')
    await page.click('button:has-text("Create")')
    await expect(page).toHaveURL(/\/workflows\//, { timeout: 10_000 })
  })

  test('sign out clears session and redirects to login', async ({ page }) => {
    await page.click('button:has-text("Sign out")')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Smoke — workflow detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', DEMO_EMAIL)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('clicking a workflow opens the detail page with wizard', async ({ page }) => {
    const firstRow = page.locator('a[href^="/workflows/"]').first()
    await firstRow.click()
    await expect(page).toHaveURL(/\/workflows\//, { timeout: 8_000 })
    // Wizard step indicators should be visible
    await expect(page.locator('h2:has-text("Step 1:")')).toBeVisible()
  })

  test('PDF export button is visible on workflow detail', async ({ page }) => {
    const firstRow = page.locator('a[href^="/workflows/"]').first()
    await firstRow.click()
    await expect(page.locator('button:has-text("Export PDF")')).toBeVisible()
  })
})

test.describe('Smoke — workflow retry (failed → draft)', () => {
  test('Retry button resets a failed workflow back to draft', async ({ page }) => {
    // 1. Log in via UI → dashboard
    await page.goto('/login')
    await page.fill('input[type="email"]', DEMO_EMAIL)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // 2. Create a workflow via UI — lands on the detail page with token still in memory
    await page.click('button:has-text("New Workflow")')
    await page.fill('input#newTitle', 'Retry E2E Test Workflow')
    await page.click('button:has-text("Create")')
    await expect(page).toHaveURL(/\/workflows\//, { timeout: 10_000 })

    // 3. Capture the workflow ID from the URL
    const workflowId = page.url().split('/workflows/')[1]

    // 4. Drive transitions via the page's own fetch (token is live in module scope).
    //    Path: draft → in_progress → submitted → failed
    const result = await page.evaluate(async (id) => {
      const token = (window as Window & { __getToken?: () => string | null }).__getToken?.() ?? ''
      const authHeader = `Bearer ${token}`

      async function transition(wfId: string, toStatus: string, currentEtag: string, reason?: string) {
        const resp = await fetch(`/api/workflows/${wfId}/transition`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'If-Match': currentEtag,
          },
          body: JSON.stringify(reason ? { status: toStatus, reason } : { status: toStatus }),
        })
        return { ok: resp.ok, status: resp.status, etag: resp.headers.get('etag') ?? '', body: await resp.json() }
      }

      // GET current ETag
      const getResp = await fetch(`/api/workflows/${id}`, {
        headers: { 'Authorization': authHeader },
      })
      const etag0 = getResp.headers.get('etag') ?? ''

      const r1 = await transition(id, 'in_progress', etag0)
      if (!r1.ok) return { failed: `in_progress: ${r1.status} ${JSON.stringify(r1.body)}` }

      const r2 = await transition(id, 'submitted', r1.etag)
      if (!r2.ok) return { failed: `submitted: ${r2.status} ${JSON.stringify(r2.body)}` }

      const r3 = await transition(id, 'failed', r2.etag, 'E2E test rejection')
      if (!r3.ok) return { failed: `failed: ${r3.status} ${JSON.stringify(r3.body)}` }

      return { ok: true, finalStatus: r3.body.status }
    }, workflowId)

    expect(result).toMatchObject({ ok: true, finalStatus: 'failed' })

    // 5. Invalidate the React Query cache so the UI refetches the workflow's new status
    await page.evaluate(() => {
      const qc = (window as Window & { __queryClient?: { invalidateQueries: (opts: object) => Promise<void> } }).__queryClient
      return qc?.invalidateQueries({ queryKey: ['workflows'] })
    })

    // 6. Click Retry — transitions failed → draft (we're still on the detail page)
    await expect(page.locator('button:has-text("Retry")')).toBeVisible({ timeout: 8_000 })
    await page.click('button:has-text("Retry")')

    // 7. Assert the status badge changes to 'Draft'
    await expect(page.locator('text=Draft').first()).toBeVisible({ timeout: 8_000 })
  })
})
