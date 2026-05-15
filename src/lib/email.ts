import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendTipNotification(opts: {
  tipNumber: string
  category:  string
  message:   string
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return

  const categoryLabels: Record<string, string> = {
    SAFETY:     'Safety Concern',
    CONDUCT:    'Workplace Conduct',
    OPERATIONS: 'Operations Issue',
    FRAUD:      'Fraud or Misconduct',
    OTHER:      'General Feedback',
  }

  const label = categoryLabels[opts.category] ?? opts.category

  await transporter.sendMail({
    from:    `"Havilon Tip Line" <${process.env.SMTP_USER}>`,
    to:      'Havilontx@gmail.com',
    subject: `[${opts.tipNumber}] Anonymous Tip — ${label}`,
    text: [
      `A new anonymous tip has been submitted through the Havilon Fleet portal.`,
      ``,
      `Reference:  ${opts.tipNumber}`,
      `Category:   ${label}`,
      ``,
      `Message:`,
      opts.message,
      ``,
      `---`,
      `This tip was submitted anonymously. No employee identity is attached.`,
      `Log in to the portal to mark it as reviewed: https://havilon-fleet.vercel.app/tips`,
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1e40af;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">🔒 Anonymous Tip Received</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <table style="width:100%;margin-bottom:20px;font-size:14px">
            <tr>
              <td style="color:#6b7280;padding:4px 0;width:100px">Reference</td>
              <td style="font-family:monospace;font-weight:bold">${opts.tipNumber}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;padding:4px 0">Category</td>
              <td>${label}</td>
            </tr>
          </table>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap">${opts.message}</div>
          <p style="font-size:12px;color:#9ca3af;margin-top:20px">
            This tip was submitted anonymously — no employee identity is recorded.<br>
            <a href="https://havilon-fleet.vercel.app/tips">View all tips in the portal →</a>
          </p>
        </div>
      </div>
    `,
  })
}
