# Havilon Fleet Repair Portal
## Fleet Oversight, Fraud Prevention & Repair Accountability System

---

## What This Is

A full-stack web application built for Havilon LLC to:
- Detect and flag fraudulent repair billing in real time
- Enforce tiered approval workflows by dollar amount
- Track every repair, part, and vendor with a permanent audit trail
- Provide owner-level dashboards and investigative tools
- Sync with Google Drive (photos), Gmail (alerts), and Sheets (accounting)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Next.js API Routes |
| Database | PostgreSQL via Prisma |
| Auth | NextAuth.js + Google OAuth |
| File Storage | Google Drive API |
| Notifications | Gmail API |
| Accounting Sync | Google Sheets API |
| Hosting | Vercel (frontend) + Railway (database) |

---

## Deploy in 30 Minutes — Step by Step

### Step 1: Database (Railway) — ~5 minutes

1. Go to [railway.app](https://railway.app) and create a free account
2. Click **New Project → PostgreSQL**
3. Click your PostgreSQL service → **Connect** → copy the `DATABASE_URL`
4. Save it — you'll need it in Step 4

### Step 2: Google Cloud Setup — ~10 minutes

#### 2a. Create a Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project called **"Havilon Fleet"**

#### 2b. Enable APIs
Go to APIs & Services → Enable these:
- Google Drive API
- Gmail API
- Google Sheets API
- Google Identity (OAuth)

#### 2c. OAuth Credentials (for login)
1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Application type: **Web application**
3. Authorized redirect URIs:
   - `https://your-domain.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for dev)
4. Save the **Client ID** and **Client Secret**

#### 2d. Service Account (for Drive, Gmail, Sheets)
1. Credentials → Create Credentials → Service Account
2. Name it "havilon-fleet-service"
3. On the service account page → Keys → Add Key → JSON
4. Download the JSON — extract `client_email` and `private_key`

#### 2e. Share Resources with Service Account
- **Google Drive**: Create a folder called "Havilon Fleet Photos", right-click → Share with the service account email as Editor
- **Gmail**: In Google Workspace Admin → Grant the service account domain-wide delegation with Gmail send scope
- **Google Sheets**: Create a sheet called "Havilon Fleet — Accounting", share with service account as Editor

### Step 3: Deploy to Vercel — ~5 minutes

```bash
# Clone or download this project
cd havilon-fleet

# Install Vercel CLI if you haven't
npm install -g vercel

# Deploy
vercel

# Follow the prompts, then go to your Vercel dashboard
```

### Step 4: Environment Variables

In Vercel dashboard → Your project → Settings → Environment Variables, add all variables from `.env.example`.

Then also create a `.env` file locally with the same values for development.

### Step 5: Database Setup — ~2 minutes

```bash
# Install dependencies
npm install

# Push schema to database
npm run db:push

# Seed with sample data (optional — uses Havilon test vehicles)
npm run db:seed
```

### Step 6: First Login

1. Go to your Vercel URL
2. Sign in with your `@havilon.com` Google account
3. You'll be assigned the `AUDIT` role by default
4. In Prisma Studio (`npm run db:studio`), update your user role to `OWNER`

---

## User Roles

| Role | Create Repairs | Approve | See Costs | See Fraud | Admin |
|---|---|---|---|---|---|
| **OWNER** | ✅ | ✅ All tiers | ✅ | ✅ | ✅ |
| **OPS_MANAGER** | ✅ | ✅ Up to Tier 3 | ✅ | ✅ | ❌ |
| **MECHANIC** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **ACCOUNTING** | ❌ | ✅ Tier 1-2 | ✅ | ❌ | ❌ |
| **AUDIT** | ❌ | ❌ | ❌ | ❌ | ❌ |

To set roles: Prisma Studio → users table → update `role` field.

---

## Approval Tiers

| Amount | Tier | Requires |
|---|---|---|
| < $250 | Tier 1 — Standard | Ops Manager + Photos |
| $250–$1,000 | Tier 2 — Secondary | Secondary approval + Estimate + Photos |
| $1,000–$2,500 | Tier 3 — Owner | Owner approval + Line-item breakdown |
| > $2,500 | Tier 4 — Executive | Owner sign-off + 2 comparative quotes + Full documentation |

---

## Fraud Detection Rules

The engine runs automatically on every repair save and invoice upload:

| Rule | Trigger | Risk Points |
|---|---|---|
| Duplicate invoice | Matching hash in last 90 days | +40 |
| Repeat repair | Same category on same VIN in 60 days (2+) | +30 |
| Excessive labor | Hours > 1.5× industry benchmark | +25 |
| Cost vs vehicle value | Repair > 30% of vehicle value | +25 |
| Parts double billing | Internal parts order matches shop invoice | +20 |
| Multiple vendors | Same VIN at multiple shops simultaneously | +20 |
| Missing photos | No before or after photos | +15 |
| High-risk vendor | Shop fraud score ≥ 70 | +15 |
| Repair too fast | Completed faster than hours billed allow | +15 |
| Missing invoice | No invoice uploaded for paid repair | +10 |

Score ≥ 60 → Automatic owner email alert.
Score ≥ 80 → Critical flag in dashboard.

---

## Development

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Prisma Studio (database viewer): `npm run db:studio`

---

## Folder Structure

```
src/
├── app/
│   ├── api/          # API routes
│   │   ├── repairs/
│   │   ├── vehicles/
│   │   ├── parts/
│   │   ├── fraud/
│   │   └── reports/
│   ├── dashboard/    # Executive overview
│   ├── repairs/      # Repair list + detail + new
│   ├── fraud/        # Fraud intelligence center
│   ├── vehicles/     # Fleet registry
│   ├── parts/        # Parts procurement
│   ├── approvals/    # Approval queue
│   └── shops/        # Vendor management
├── services/
│   ├── fraud-engine.ts       # Core fraud detection
│   ├── approval-engine.ts    # Workflow + tier enforcement
│   └── google-workspace.ts   # Drive, Gmail, Sheets
├── middleware/
│   └── rbac.ts               # Role-based access
├── lib/
│   └── auth.ts               # NextAuth config
└── components/
    ├── layout/
    └── repair/
prisma/
├── schema.prisma             # Full database schema
└── seed.ts                   # Test data
```

---

## Estimated Monthly Cost

| Service | Plan | Cost |
|---|---|---|
| Railway (PostgreSQL) | Starter | $5/mo |
| Vercel | Hobby | Free |
| Google Workspace | Business Starter | Already have it |
| Google APIs | Within free tier | Free |
| **Total** | | **~$5/mo** |

At scale (100+ vehicles, heavy usage): ~$20–$50/mo.

---

## Support & Questions

This codebase was designed specifically for Havilon LLC's Amazon DSP operation.
The fraud engine thresholds in `src/services/fraud-engine.ts` can be tuned in `FRAUD_RULES`.
