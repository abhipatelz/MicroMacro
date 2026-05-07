# Pragati — Quality Informatics Project Manager

> Project & task management built for pharma QA teams. Tracks Deviations, CAPAs, Change Controls, and Software Changes with GxP compliance built in.

**Live:** https://pragatialm.vercel.app · **Version:** 1.0.0

---

## What it does

Pragati is a purpose-built PM tool for Quality Informatics. Unlike generic project tools, it understands pharma lifecycles, GxP-critical tasks, QA sign-off requirements, and regulatory context out of the box.

- Lifecycle templates for Deviation, CAPA, Change Control, Software Change, CSV Validation, Audit, Pharmacovigilance, and more
- GxP-critical task flagging and QA sign-off tracking per task
- Drag-and-drop Kanban board (To Do → In Progress → Review → Blocked → Done)
- PM dashboard with org-wide pulse, project health radar, team velocity, and stuck-task detection
- **QA Triage Assistant** — classify any quality event by severity and get CAPA action suggestions
- Export any project to a meeting-ready Excel file (Executive Summary, All Tasks, Blockers & Bottlenecks)
- Two roles: **PM** (full access) and **Individual Contributor** (tasks, projects, triage)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | MongoDB via Mongoose |
| Auth | JWT — httpOnly cookies |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Excel export | ExcelJS |
| Deployment | Vercel |

---

## Getting started

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or use in-memory mode for local dev)

### 1. Clone and install

```bash
git clone https://github.com/abhieq3/MicroMacro.git
cd MicroMacro
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/pragati

# Required — generate with: openssl rand -base64 48
JWT_SECRET=your-long-random-secret

# Optional — for local dev without MongoDB Atlas
USE_IN_MEMORY_MONGO=true

# Required for password reset emails
SMTP_HOST=smtp.yourprovider.com
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
APP_URL=https://yourdomain.com
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. First login

Registration happens on the `/login` page (the form switches between sign-in and sign-up). The first account created becomes the **PM (workspace owner)** automatically. After that, self-registration is disabled — all new accounts must be created by a PM via the People page.

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel link
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel --prod
```

The app is a standard Next.js App Router project — zero additional Vercel configuration needed.

---

## Roles

| Feature | PM | Individual Contributor |
|---|:---:|:---:|
| Org dashboard & pulse | ✓ | — |
| Insights & team analytics | ✓ | — |
| Create & manage projects | ✓ | — |
| View projects & tasks | ✓ | ✓ |
| Update task status | ✓ | ✓ |
| QA Triage Assistant | ✓ | ✓ |
| Export to Excel | ✓ | ✓ |
| Yearly task view | ✓ | ✓ |
| People management | ✓ | — |
| Promote / demote roles | ✓ | — |

---

## Project structure

```
src/
├── app/
│   ├── (authed)/          # All authenticated pages
│   │   ├── page.tsx       # Home dashboard
│   │   ├── projects/      # Project list + detail + new
│   │   ├── tasks/[id]/    # Task detail
│   │   ├── triage/        # QA Triage Assistant
│   │   ├── insights/      # PM insights page
│   │   ├── org/           # Command Centre
│   │   ├── people/        # People management
│   │   ├── teams/         # Teams
│   │   └── yearly/        # Yearly task view
│   ├── api/               # All API routes
│   │   ├── auth/          # Login, register, password
│   │   ├── projects/      # CRUD + export
│   │   ├── tasks/         # CRUD + subtasks + comments + signoff
│   │   ├── ai/            # Triage + risk scoring
│   │   ├── insights/      # PM analytics
│   │   └── me/            # Current-user endpoints
│   └── login/             # Public login page
├── components/
│   ├── AppShell.tsx       # Sidebar, nav, notifications
│   ├── ui.tsx             # Shared UI components
│   ├── CommandPalette.tsx # ⌘K global search
│   └── Tour.tsx           # Onboarding tour
├── lib/
│   ├── auth.ts            # JWT helpers
│   ├── db.ts              # MongoDB connection
│   ├── lifecycles.ts      # Pharma lifecycle templates
│   └── ai/
│       ├── triage.ts      # QA event severity classifier
│       └── risk.ts        # Task risk scoring model
└── models/                # Mongoose schemas
    ├── User.ts
    ├── Project.ts
    └── Task.ts
```

---

## QA Triage Assistant

The triage engine is a rule-based classifier tuned for pharma QA language. It is fully auditable — every severity point is traceable to a specific signal.

**Categories detected:**
- Data Integrity (ALCOA+)
- CSV / Computerized System Validation
- Pharmacovigilance / ICSR
- Audit Trail Issues
- Lab Informatics (LIMS, chromatography)
- Training / Competency

**Severity signals include:** patient safety keywords, batch impact, regulatory/inspection exposure, data falsification, shared credentials, audit trail compromise, repeat findings, and more.

CAPA suggestions are drawn from 21 CFR Part 11, ICH Q10, GAMP 5, and ALCOA+ guidance.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs (min 32 chars) |
| `USE_IN_MEMORY_MONGO` | Dev only | Set `true` to skip MongoDB Atlas in local dev |
| `SMTP_HOST` | For email | SMTP server hostname |
| `SMTP_USER` | For email | SMTP username |
| `SMTP_PASS` | For email | SMTP password |
| `APP_URL` | For email | Public URL used in password reset links |

---

## License

Private — internal use only.
