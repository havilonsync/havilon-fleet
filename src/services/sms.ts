/**
 * Havilon LLC — SMS Notification Service
 *
 * Sends weekly scorecards to DAs via text message.
 * Uses Twilio. Requires these env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER  (your Twilio number, e.g. +18175550100)
 *
 * Cost: ~$0.0079 per text. For 44 DAs weekly = ~$0.35/week = ~$18/year.
 */

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM_NUMBER  = process.env.TWILIO_PHONE_NUMBER

// ─── Send a single SMS ────────────────────────────────────────────────────────

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !FROM_NUMBER) {
    console.warn('SMS not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER')
    return { success: false, error: 'SMS not configured' }
  }

  // Normalize phone number to E.164 format
  const normalized = normalizePhone(to)
  if (!normalized) {
    return { success: false, error: `Invalid phone number: ${to}` }
  }

  // SignalWire uses the same API format as Twilio
  // Set SIGNALWIRE_SPACE_URL in env to use SignalWire (e.g. havilon.signalwire.com)
  // Leave unset to use Twilio
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL
  const baseUrl = spaceUrl
    ? `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
    : `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')
    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: FROM_NUMBER,
          To:   normalized,
          Body: message,
        }),
      }
    )

    if (res.ok) {
      return { success: true }
    } else {
      const err = await res.json()
      console.error('Twilio error:', err)
      return { success: false, error: err.message }
    }
  } catch (err: any) {
    console.error('SMS send failed:', err)
    return { success: false, error: err.message }
  }
}

// ─── Send weekly scorecard SMS to a DA ───────────────────────────────────────

export async function sendScorecardSMS(da: {
  name: string
  phone: string | null
}, scorecard: {
  week: string
  deliveryScore: number
  qualityScore: number
  safetyScore: number
  standing: string
  dnrRate: number
  dsbRate: number
}): Promise<{ success: boolean; skipped?: boolean; error?: string }> {

  if (!da.phone) {
    return { success: false, skipped: true, error: 'No phone number on file' }
  }

  const standing = scorecard.standing
    .replace('_PLUS', '+')
    .replace(/_/g, ' ')

  const emoji =
    scorecard.standing === 'FANTASTIC_PLUS' ? '🌟' :
    scorecard.standing === 'FANTASTIC'      ? '⭐' :
    scorecard.standing === 'GREAT'          ? '✅' :
    scorecard.standing === 'GOOD'           ? '👍' :
    scorecard.standing === 'FAIR'           ? '⚠️' : '❌'

  const firstName = da.name.split(' ')[0]

  const message = [
    `Hi ${firstName}! Your Havilon LLC weekly scorecard is ready. ${emoji}`,
    ``,
    `Week: ${scorecard.week}`,
    `Overall: ${standing}`,
    `Delivery Score: ${scorecard.deliveryScore.toFixed(0)}/100`,
    `Quality Score: ${scorecard.qualityScore.toFixed(0)}/100`,
    `Safety Score: ${scorecard.safetyScore.toFixed(0)}/100`,
    scorecard.dnrRate > 0 ? `DNR Rate: ${scorecard.dnrRate.toFixed(1)}%` : null,
    scorecard.dsbRate > 0 ? `DSB Rate: ${scorecard.dsbRate.toFixed(1)}%` : null,
    ``,
    scorecard.standing === 'FANTASTIC_PLUS'
      ? `Excellent work this week! Keep it up.`
      : scorecard.standing === 'FANTASTIC' || scorecard.standing === 'GREAT'
      ? `Great performance this week!`
      : scorecard.standing === 'GOOD'
      ? `Good week — keep pushing for Fantastic!`
      : `Let's work together to improve your score next week.`,
    ``,
    `View full scorecard: havilon-fleet.vercel.app`,
    `-Havilon LLC Management`,
  ].filter(l => l !== null).join('\n')

  return sendSMS(da.phone, message)
}

// ─── Send bulk scorecards after weekly sync ───────────────────────────────────

export async function sendWeeklyScorecardTexts(results: {
  da: { name: string; phone: string | null }
  scorecard: any
}[]): Promise<{
  sent: number
  failed: number
  skipped: number
  errors: string[]
}> {
  const summary = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] }

  for (const { da, scorecard } of results) {
    // Small delay between messages to avoid rate limits
    await new Promise(r => setTimeout(r, 200))

    const result = await sendScorecardSMS(da, scorecard)

    if (result.skipped) {
      summary.skipped++
    } else if (result.success) {
      summary.sent++
    } else {
      summary.failed++
      if (result.error) summary.errors.push(`${da.name}: ${result.error}`)
    }
  }

  console.log(`📱 Scorecard SMS: ${summary.sent} sent, ${summary.skipped} skipped (no phone), ${summary.failed} failed`)
  return summary
}

// ─── Send a custom management alert to a DA ──────────────────────────────────

export async function sendManagementAlert(
  phone: string,
  daName: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const firstName = daName.split(' ')[0]
  const fullMessage = `Hi ${firstName}, this is Havilon LLC Management:\n\n${message}\n\nQuestions? Contact your Operations Manager.`
  return sendSMS(phone, fullMessage)
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string | null {
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '')

  // US numbers
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`

  // Already has country code
  if (digits.length > 11) return `+${digits}`

  return null
}
