/**
 * Havilon LLC — Dispatch Broadcast Service
 *
 * Sends daily route assignments to DAs via SMS and/or email.
 * Dispatchers trigger this from the dispatch board with one click.
 *
 * Each DA only receives THEIR OWN assignment — not everyone's schedule.
 * A separate summary goes to management with the full day's roster.
 */

import { sendSMS } from '@/services/sms'
import { format } from 'date-fns'
import prisma from '@/lib/prisma'


// ─── Send individual assignment to each DA ────────────────────────────────────

export async function broadcastDailySchedule(date: string): Promise<{
  sms:   { sent: number; failed: number; skipped: number }
  email: { sent: number; failed: number; skipped: number }
  total: number
}> {
  const routes = await prisma.routeAssignment.findMany({
    where: { date },
    include: {
      da:      { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { vehicleNumber: true } },
    },
  })

  if (routes.length === 0) {
    return { sms: { sent: 0, failed: 0, skipped: 0 }, email: { sent: 0, failed: 0, skipped: 0 }, total: 0 }
  }

  const dayLabel   = format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d')
  const smsResult  = { sent: 0, failed: 0, skipped: 0 }
  const emailResult = { sent: 0, failed: 0, skipped: 0 }

  for (const route of routes) {
    if (!route.da) continue

    const message = buildDAMessage(route, dayLabel)

    // Send SMS
    if (route.da.phone) {
      const result = await sendSMS(route.da.phone, message)
      if (result.success) smsResult.sent++
      else { smsResult.failed++; console.error(`SMS failed for ${route.da.name}:`, result.error) }
    } else {
      smsResult.skipped++
    }

    // Send email
    if (route.da.email) {
      const emailSent = await sendScheduleEmail(route.da.email, route.da.name, message, route, dayLabel)
      if (emailSent) emailResult.sent++
      else { emailResult.failed++; }
    } else {
      emailResult.skipped++
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 150))
  }

  // Send management summary
  await sendManagementSummary(routes, date, dayLabel)

  console.log(`📢 Broadcast complete for ${date}: SMS ${smsResult.sent} sent, Email ${emailResult.sent} sent`)

  return { sms: smsResult, email: emailResult, total: routes.length }
}

// ─── Build the message for an individual DA ───────────────────────────────────

function buildDAMessage(route: any, dayLabel: string): string {
  const lines = [
    `📦 Havilon LLC — ${dayLabel}`,
    ``,
    `Hi ${route.da.name.split(' ')[0]}! Here is your assignment for today:`,
    ``,
    `Route: ${route.routeCode}${route.routeType !== 'BASE' ? ` (${route.routeType})` : ''}`,
    `Van: ${route.vehicle?.vehicleNumber ?? 'TBD'}`,
    route.stopCount     ? `Stops: ${route.stopCount}`           : null,
    route.packageVolume ? `Packages: ${route.packageVolume}`    : null,
    route.stageLocation ? `Stage: ${route.stageLocation}`       : null,
    route.departureTime ? `Departure: ${route.departureTime}`   : null,
    route.phoneImei     ? `Phone IMEI: ${route.phoneImei}`      : null,
    ``,
    `Drive safe and deliver excellence! 🚐`,
    `-Havilon LLC Dispatch`,
  ]

  return lines.filter(l => l !== null).join('\n')
}

// ─── Send email version ───────────────────────────────────────────────────────

async function sendScheduleEmail(
  to: string,
  name: string,
  textMessage: string,
  route: any,
  dayLabel: string
): Promise<boolean> {
  try {
    // Use Gmail via nodemailer (already in the project)
    const nodemailer = await import('nodemailer')

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_FROM,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <img src="${process.env.NEXTAUTH_URL}/havilon-logo.jpg" alt="Havilon LLC" style="width: 60px; margin-bottom: 16px;" />
        <h2 style="color: #1e3a6e; margin-bottom: 4px;">Your Route Assignment</h2>
        <p style="color: #64748b; margin-bottom: 24px;">${dayLabel}</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Route</td>
                <td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.routeCode}${route.routeType !== 'BASE' ? ` (${route.routeType})` : ''}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Van</td>
                <td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.vehicle?.vehicleNumber ?? 'TBD'}</td></tr>
            ${route.stopCount ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Stops</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.stopCount}</td></tr>` : ''}
            ${route.packageVolume ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Packages</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.packageVolume}</td></tr>` : ''}
            ${route.stageLocation ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Stage Location</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.stageLocation}</td></tr>` : ''}
            ${route.departureTime ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Departure</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${route.departureTime}</td></tr>` : ''}
            ${route.phoneImei ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Phone IMEI</td><td style="padding: 6px 0; font-weight: 600; font-size: 12px; text-align: right;">${route.phoneImei}</td></tr>` : ''}
          </table>
        </div>

        <p style="color: #374151; font-size: 14px;">Drive safe and deliver excellence! 🚐</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Havilon LLC — Personnel & Fleet Management<br>
        <a href="${process.env.NEXTAUTH_URL}" style="color: #3b82f6;">View Portal</a></p>
      </div>
    `

    await transporter.sendMail({
      from:    `Havilon LLC Dispatch <${process.env.GMAIL_FROM}>`,
      to,
      subject: `Your Route Assignment — ${dayLabel}`,
      text:    textMessage,
      html:    htmlBody,
    })

    return true
  } catch (err) {
    console.error(`Email failed for ${name}:`, err)
    return false
  }
}

// ─── Send full roster summary to management ───────────────────────────────────

async function sendManagementSummary(routes: any[], date: string, dayLabel: string) {
  try {
    const managers = await prisma.user.findMany({
      where: { role: { in: ['OWNER', 'OPS_MANAGER'] }, isActive: true },
    })

    const roster = routes.map(r =>
      `${r.da?.name ?? 'Unassigned'} — ${r.routeCode} — Van ${r.vehicle?.vehicleNumber ?? '?'} — ${r.departureTime ?? 'TBD'}`
    ).join('\n')

    const summary = `📋 Havilon LLC Dispatch Summary\n${dayLabel}\n\n${routes.length} routes dispatched:\n\n${roster}\n\n-Havilon LLC Portal`

    for (const mgr of managers) {
      await prisma.notification.create({
        data: {
          userId:     mgr.id,
          type:       'DISPATCH_BROADCAST',
          title:      `📢 Dispatch broadcast sent — ${routes.length} DAs notified for ${date}`,
          body:       `SMS and email sent to all assigned DAs for ${dayLabel}.`,
          channel:    'in_app',
          entityType: 'dispatch',
          entityId:   date,
        },
      })
    }
  } catch (err) {
    console.error('Management summary failed:', err)
  }
}
