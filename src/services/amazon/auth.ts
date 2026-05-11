/**
 * Havilon Fleet — Amazon DSP Authentication Service
 * 
 * Handles login to logistics.amazon.com and session management.
 * Uses Puppeteer for authenticated browser session, then extracts
 * cookies to call the JSON APIs directly (much faster than scraping HTML).
 * 
 * Credentials are NEVER stored in code — loaded from environment variables only.
 * 
 * Setup: Add to .env
 *   AMAZON_DSP_EMAIL=havilon.sync@gmail.com
 *   AMAZON_DSP_PASSWORD=your-password-here
 *   AMAZON_DSP_CODE=HAVL
 *   AMAZON_STATION_CODE=DDF4
 */

// Puppeteer loaded dynamically to avoid build-time errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any
type Page = any

const AMAZON_BASE = 'https://logistics.amazon.com'
const LOGIN_URL = `${AMAZON_BASE}/`
const PERFORMANCE_URL = `${AMAZON_BASE}/performance/overview`

// Session cache — reuse cookies across calls within same process lifetime
let cachedCookies: any[] | null = null
let cookiesExpiry: Date | null = null

export interface AmazonSession {
  cookies: any[]
  headers: Record<string, string>
}

// ─── Login and capture session ────────────────────────────────────────────────

export async function getAmazonSession(): Promise<AmazonSession> {
  // Return cached session if still valid (cookies last ~8 hours)
  if (cachedCookies && cookiesExpiry && new Date() < cookiesExpiry) {
    return buildSession(cachedCookies)
  }

  console.log('🔐 Authenticating with Amazon DSP portal...')

  const puppeteer = await import('puppeteer').then(m => m.default)
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    // Navigate to Amazon logistics portal
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Handle Amazon login flow
    await performLogin(page)

    // Wait for portal to fully load after login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })

    // Verify we're logged in by checking for portal elements
    const isLoggedIn = await verifyLogin(page)
    if (!isLoggedIn) {
      throw new Error('Login failed — check Amazon DSP credentials in .env')
    }

    // Capture all cookies from the authenticated session
    const cookies = await page.cookies()

    // Cache for 7 hours (Amazon sessions typically last 8+ hours)
    cachedCookies = cookies
    cookiesExpiry = new Date(Date.now() + 7 * 60 * 60 * 1000)

    console.log('✅ Amazon DSP session established')
    return buildSession(cookies)

  } finally {
    await browser.close()
  }
}

// ─── Login flow handler ───────────────────────────────────────────────────────

async function performLogin(page: Page): Promise<void> {
  const email = process.env.AMAZON_DSP_EMAIL
  const password = process.env.AMAZON_DSP_PASSWORD

  if (!email || !password) {
    throw new Error('AMAZON_DSP_EMAIL and AMAZON_DSP_PASSWORD must be set in .env')
  }

  try {
    // Wait for email field (Amazon login page)
    await page.waitForSelector('#ap_email', { timeout: 10000 })
    await page.type('#ap_email', email, { delay: 50 })
    await page.click('#continue')
    await page.waitForSelector('#ap_password', { timeout: 10000 })
    await page.type('#ap_password', password, { delay: 50 })
    await page.click('#signInSubmit')
  } catch {
    // Try alternate selectors if standard Amazon login doesn't match
    try {
      await page.waitForSelector('[name="email"]', { timeout: 5000 })
      await page.type('[name="email"]', email)
      await page.keyboard.press('Tab')
      await page.type('[name="password"]', password)
      await page.keyboard.press('Enter')
    } catch {
      throw new Error('Could not find login form — Amazon may have changed their login page')
    }
  }
}

async function verifyLogin(page: Page): Promise<boolean> {
  try {
    // Check for portal nav elements that only appear when logged in
    await page.waitForSelector('[data-testid="nav-menu"], .portal-nav, #nav-bar', { timeout: 15000 })
    return true
  } catch {
    // Check URL — if we're on a dashboard URL, we're logged in
    const url = page.url()
    return url.includes('logistics.amazon.com') && !url.includes('signin')
  }
}

// ─── Build session object from cookies ───────────────────────────────────────

function buildSession(cookies: any[]): AmazonSession {
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ')

  return {
    cookies,
    headers: {
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://logistics.amazon.com/performance/overview',
      'Origin': 'https://logistics.amazon.com',
    },
  }
}

// ─── Invalidate session (force re-login on next call) ────────────────────────

export function invalidateSession(): void {
  cachedCookies = null
  cookiesExpiry = null
  console.log('Amazon DSP session invalidated — will re-authenticate on next sync')
}

// ─── Direct API caller ────────────────────────────────────────────────────────

export async function callAmazonAPI<T = any>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const session = await getAmazonSession()

  const url = new URL(`${AMAZON_BASE}${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: session.headers,
    credentials: 'include',
  })

  if (response.status === 401 || response.status === 403) {
    // Session expired — invalidate and retry once
    invalidateSession()
    const freshSession = await getAmazonSession()
    const retry = await fetch(url.toString(), {
      method: 'GET',
      headers: freshSession.headers,
    })
    if (!retry.ok) throw new Error(`Amazon API error ${retry.status}: ${endpoint}`)
    return retry.json()
  }

  if (!response.ok) {
    throw new Error(`Amazon API error ${response.status} on ${endpoint}`)
  }

  return response.json()
}
