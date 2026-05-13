/**
 * Havilon Fleet — Google Workspace Integration
 * Handles Drive photo storage, Gmail notifications, and Sheets sync.
 *
 * Setup: Add to .env:
 *   GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID=your-shared-drive-folder-id
 *   GMAIL_FROM=alerts@havilon.com
 *   GMAIL_TO_OWNER=owner@havilon.com
 *   GOOGLE_SHEETS_ID=your-spreadsheet-id
 */

import { google } from 'googleapis'
import { Readable } from 'stream'

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
]

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  })
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

export async function createRepairFolder(repairNumber: string, vin: string, vehicleNumber: string) {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

  // Create or find VIN folder
  const vinFolderName = `${vehicleNumber}_${vin.slice(-6)}`
  let vinFolderId: string

  const vinSearch = await drive.files.list({
    q: `name='${vinFolderName}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })

  if (vinSearch.data.files?.length) {
    vinFolderId = vinSearch.data.files[0].id!
  } else {
    const vinFolder = await drive.files.create({
      requestBody: {
        name: vinFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId!],
      },
      fields: 'id',
    })
    vinFolderId = vinFolder.data.id!
  }

  // Create repair-specific folder inside VIN folder
  const repairFolderName = `${repairNumber}_${new Date().toISOString().slice(0, 10)}`
  const repairFolder = await drive.files.create({
    requestBody: {
      name: repairFolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [vinFolderId],
    },
    fields: 'id, webViewLink',
  })

  // Create subfolders for organization
  const subfolders = ['01_Before', '02_During', '03_After', '04_Invoices', '05_Estimates']
  const subfolderIds: Record<string, string> = {}

  for (const name of subfolders) {
    const sf = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [repairFolder.data.id!],
      },
      fields: 'id',
    })
    subfolderIds[name] = sf.data.id!
  }

  return {
    repairFolderId: repairFolder.data.id!,
    repairFolderUrl: repairFolder.data.webViewLink!,
    subfolderIds,
  }
}

export async function uploadPhotoToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ fileId: string; viewUrl: string }> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const stream = Readable.from(fileBuffer)

  const file = await drive.files.create({
    requestBody: {
      name: `${Date.now()}_${fileName}`,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  })

  // Make viewable by anyone in organization
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: {
      role: 'reader',
      type: 'domain',
      domain: process.env.GOOGLE_WORKSPACE_DOMAIN ?? 'havilon.com',
    },
  })

  return {
    fileId: file.data.id!,
    viewUrl: file.data.webViewLink!,
  }
}

// ─── Gmail Notifications ──────────────────────────────────────────────────────

interface EmailPayload {
  to: string
  subject: string
  html: string
}

async function sendEmail(payload: EmailPayload) {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const message = [
    `To: ${payload.to}`,
    `From: Havilon LLC — Personnel & Fleet Management <${process.env.GMAIL_FROM ?? 'alerts@havilon.com'}>`,
    `Subject: ${payload.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    payload.html,
  ].join('\n')

  const encodedMessage = Buffer.from(message).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  })
}

export async function sendFraudAlertEmail(params: {
  to: string
  repairNumber: string
  vehicleNumber: string
  shopName: string
  amount: number
  riskScore: number
  flags: string[]
  repairUrl: string
}) {
  const flagList = params.flags.map(f => `<li style="color:#dc2626;margin:4px 0">${f.replace(/_/g, ' ')}</li>`).join('')

  await sendEmail({
    to: params.to,
    subject: `🚨 FRAUD ALERT — ${params.repairNumber} — Risk Score: ${params.riskScore}/100`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#dc2626;color:white;padding:20px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:20px">⚠️ Fraud Alert — Havilon LLC — Personnel & Fleet Management</h1>
          <p style="margin:8px 0 0;opacity:0.9">Risk Score: ${params.riskScore}/100 — Immediate action required</p>
        </div>
        <div style="border:1px solid #fca5a5;border-top:none;padding:24px;background:#fff8f8;border-radius:0 0 8px 8px">
          <table style="width:100%;font-size:14px;margin-bottom:20px">
            <tr><td style="color:#6b7280;padding:4px 0">Repair Number</td><td style="font-weight:600">${params.repairNumber}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Vehicle</td><td style="font-weight:600">${params.vehicleNumber}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Repair Shop</td><td style="font-weight:600">${params.shopName}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Invoice Amount</td><td style="font-weight:600;color:#dc2626">$${params.amount.toFixed(2)}</td></tr>
          </table>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:16px;margin-bottom:20px">
            <p style="font-weight:600;margin:0 0 8px;color:#991b1b">Detected Flags:</p>
            <ul style="margin:0;padding-left:20px">${flagList}</ul>
          </div>
          <a href="${params.repairUrl}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Review in Portal →
          </a>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">
            This alert was automatically generated by the Havilon Fleet Fraud Detection Engine.
            Do not authorize payment for this repair until flags are resolved.
          </p>
        </div>
      </div>
    `,
  })
}

export async function sendApprovalRequestEmail(params: {
  to: string
  repairNumber: string
  vehicleNumber: string
  category: string
  amount: number
  requestedBy: string
  tier: string
  repairUrl: string
}) {
  await sendEmail({
    to: params.to,
    subject: `📋 Approval Required — ${params.repairNumber} — $${params.amount.toFixed(0)} (${params.tier})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a56db;color:white;padding:20px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:20px">Repair Approval Required</h1>
          <p style="margin:8px 0 0;opacity:0.9">${params.tier} — Owner Action Needed</p>
        </div>
        <div style="border:1px solid #bfdbfe;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <table style="width:100%;font-size:14px;margin-bottom:20px">
            <tr><td style="color:#6b7280;padding:4px 0">Repair</td><td style="font-weight:600">${params.repairNumber}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Vehicle</td><td style="font-weight:600">${params.vehicleNumber}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Category</td><td style="font-weight:600">${params.category}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Amount</td><td style="font-weight:600">$${params.amount.toFixed(2)}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Requested By</td><td>${params.requestedBy}</td></tr>
          </table>
          <a href="${params.repairUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Review & Approve in Portal →
          </a>
        </div>
      </div>
    `,
  })
}

// ─── Google Sheets Sync ───────────────────────────────────────────────────────

export async function syncRepairsToSheets(repairs: any[]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID

  if (!spreadsheetId) return

  const headers = [
    'Repair Number', 'Vehicle', 'VIN', 'Category', 'Shop', 'Status',
    'Request Date', 'Total Cost', 'Labor Hours', 'Parts Cost',
    'Fraud Score', 'Fraud Flags', 'Approved By', 'Photos Complete',
  ]

  const rows = repairs.map(r => [
    r.repairNumber,
    r.vehicle?.vehicleNumber ?? '',
    r.vehicle?.vin ?? '',
    r.category,
    r.shop?.name ?? '',
    r.status,
    r.requestDate?.toISOString().slice(0, 10) ?? '',
    r.totalCost ?? '',
    r.laborHours ?? '',
    r.partsCost ?? '',
    r.fraudScore,
    r.fraudFlags?.join(', ') ?? '',
    r.approvedBy?.name ?? '',
    r.photosBefore?.length > 0 && r.photosAfter?.length > 0 ? 'Yes' : 'No',
  ])

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Repairs!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  })
}

// ─── Staff Invite Email ───────────────────────────────────────────────────────

export async function sendStaffInviteEmail(params: {
  to: string
  name: string
  role: string
  portalUrl: string
  invitedBy: string
}) {
  const roleDescriptions: Record<string, string> = {
    OPS_MANAGER: 'Ops Manager — can create and approve repairs',
    MECHANIC: 'Mechanic / Repair Staff — can upload photos and update repair status',
    ACCOUNTING: 'Accounting — can view invoices and cost data',
    AUDIT: 'Auditor — read-only access',
  }
  await sendEmail({
    to: params.to,
    subject: `You've been added to the Havilon LLC — Personnel & Fleet Management`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><div style="background:#1a56db;color:white;padding:20px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:18px">Havilon LLC — Personnel & Fleet Management — Access Granted</h1></div><div style="border:1px solid #bfdbfe;border-top:none;padding:24px;border-radius:0 0 8px 8px;background:#fff"><p>Hi ${params.name},</p><p>${params.invitedBy} has added you to the <strong>Havilon LLC Personnel & Fleet Management</strong>.</p><div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px;margin-bottom:20px"><p style="margin:0;font-size:14px"><strong>Your role:</strong> ${roleDescriptions[params.role] ?? params.role}</p></div><p style="font-size:14px">Sign in using your Google account (<strong>${params.to}</strong>) — no password needed.</p><a href="${params.portalUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Open Personnel & Fleet Management →</a></div></div>`,
  })
}
