# Mileage Tracker — Branch Travel Reimbursement

A lightweight web app for tracking mileage between bank branches and calculating expense reimbursements.

## Features

- **PIN Login** — Simple 4–8 digit PIN to secure your data. Works reliably on iOS Home Screen web apps.
- **Quick Entry** — Select origin/destination branches and routes from dropdowns; miles and reimbursement auto-calculate
- **Multiple Entries Per Day** — Add as many trips as needed for any given day
- **Monthly View** — See all entries for a selected month with running totals
- **Edit / Delete / Duplicate** — Full CRUD on every entry with confirmation dialogs
- **CSV Export** — Download a clean CSV of the month's entries
- **Excel Export** — Download a formatted reimbursement form (.xlsx) using the official bank template
- **Reset Month** — Clear all entries for a month when you're ready to start fresh
- **Filter by Day** — Quickly filter the table to a specific day
- **Return Trip** — Checkbox to automatically create a round-trip entry
- **Home Branch** — Set once, auto-fills the "From" field
- **Swap Branches** — Quick ⇄ button to reverse origin/destination
- **Auto-generated Purpose** — If you leave "Business Purpose" blank, it auto-fills (e.g., "Mileage: Bellmead to Downtown via I-35")
- **Printable** — Use Ctrl/Cmd+P for a clean print layout
- **Mobile First** — Responsive design optimized for iPhone home-screen use, then scales up for tablets and desktop

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Python / Flask                          |
| Database  | PostgreSQL (production) / SQLite (local)|
| Frontend  | HTML / CSS / JS                         |
| Excel     | openpyxl                                |
| Hosting   | Render.com + Neon PostgreSQL (free)     |

## Quick Start

### 1. Prerequisites

- Python 3.8+ installed ([python.org](https://python.org))

### 2. Install Dependencies

```bash
cd "Mileage tracker"
pip install -r requirements.txt
```

### 3. Run the App

```bash
python app.py
```

The app will start at **http://127.0.0.1:5000** using a local SQLite database.

### 4. Open in Browser

Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000)

On first visit, you'll be prompted to create an account with your name and a PIN.

## Deployment (Render + Neon)

The app is designed to run on Render.com with a free Neon PostgreSQL database for persistent storage.

### 1. Set Up Neon PostgreSQL (Free)

1. Sign up at [neon.tech](https://neon.tech) (free tier: 512MB storage)
2. Create a new project and database
3. Copy the connection string — it looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
   ```

### 2. Configure Render

1. Push this repo to GitHub
2. In [Render Dashboard](https://dashboard.render.com) → New → Web Service → connect your repo
3. Go to **Environment** → Add environment variable:
   - Key: `DATABASE_URL`
   - Value: *(paste your Neon connection string)*
4. Deploy — the app auto-creates tables on first startup

> **Why not SQLite on Render?** Render's free tier uses an ephemeral filesystem that is wiped on every deploy. By using an external PostgreSQL database, your data persists across all deployments.

## Project Structure

```
Mileage tracker/
├── app.py              # Flask application & API routes
├── database.py         # Database layer (PostgreSQL + SQLite dual-backend)
├── routes_data.py      # Mileage table & reimbursement logic
├── requirements.txt    # Python dependencies
├── render.yaml         # Render.com deployment config
├── mileage.db          # SQLite database (local dev only, auto-created)
├── Blank Expense Reimbursement Form - 2026.xlsx
│                       # Official bank template for Excel export
├── templates/
│   └── index.html      # Main page template (auth + app screens)
├── static/
│   ├── css/
│   │   └── style.css   # Mobile-first responsive styles
│   └── js/
│       └── app.js      # Frontend logic (auth, CRUD, export)
├── CHANGELOG.md
└── README.md
```

## Authentication

The app uses a simple PIN-based login system:

1. **First Visit** — Create an account with your name and a 4–8 digit PIN
2. **Returning** — Enter your PIN to access your data
3. **iOS Friendly** — Unlike cookies, your PIN works even if the browser clears storage

PINs are hashed server-side (SHA-256 with salt). Each PIN maps to a unique user ID, and all data is scoped to that user.

> **Production:** Set the `DATABASE_URL` environment variable to use PostgreSQL (e.g. Neon). Locally, the app uses SQLite automatically.

## Mileage Table (Built-in)

| From           | To             | Route    | Miles |
|----------------|----------------|----------|------:|
| Bellmead       | Plaza/Woodway  | I-35     | 11.57 |
| Bellmead       | Downtown       | I-35     |  3.93 |
| Bellmead       | Owen           | I-35     | 11.40 |
| Plaza/Woodway  | Bellmead       | I-35     | 11.00 |
| Plaza/Woodway  | Downtown       | Franklin |  5.20 |
| Plaza/Woodway  | Downtown       | I-35     |  7.90 |
| Plaza/Woodway  | Owen           | Hwy 6   |  0.50 |
| Downtown       | Plaza/Woodway  | Franklin |  6.13 |
| Downtown       | Plaza/Woodway  | I-35     |  8.43 |
| Downtown       | Bellmead       | I-35     |  4.00 |
| Downtown       | Owen           | Franklin |  5.30 |
| Downtown       | Owen           | I-35     |  8.10 |
| Owen           | Bellmead       | I-35     | 11.40 |
| Owen           | Plaza/Woodway  | Hwy 6   |  1.90 |
| Owen           | Downtown       | I-35     |  8.50 |
| Owen           | Downtown       | Franklin |  5.60 |

**Reimbursement Rate:** $0.725/mile (2026)

## Usage Workflow

1. **Log In** — Enter your PIN (or create an account on first visit)
2. **Select Month/Year** — Use the arrows or dropdowns at the top
3. **Add Entry** — Pick the day, from/to branches, and route → miles fill automatically
4. **Save** — Click "Save Entry" to store it
5. **Review** — Entries appear in the table below with running totals
6. **Export** — Click CSV or Excel to download your reimbursement report
7. **Reset** — Click Reset to clear the month after submitting your expense report

## API Reference

| Method | Endpoint              | Description                  |
|--------|-----------------------|------------------------------|
| POST   | `/api/auth/register`  | Create new user (PIN + name) |
| POST   | `/api/auth/login`     | Log in with PIN              |
| POST   | `/api/auth/verify`    | Verify stored session        |
| GET    | `/api/auth/status`    | Check if any users exist     |
| GET    | `/api/branches`       | List all branches            |
| GET    | `/api/routes`         | Get routes between branches  |
| GET    | `/api/mileage-table`  | Full mileage reference       |
| GET    | `/api/rate`           | Current reimbursement rate   |
| GET    | `/api/entries`        | Entries for month/year       |
| POST   | `/api/entries`        | Create new entry             |
| PUT    | `/api/entries/<id>`   | Update entry                 |
| DELETE | `/api/entries/<id>`   | Delete entry                 |
| POST   | `/api/entries/clear`  | Clear all entries for month  |
| GET    | `/api/export/csv`     | Download CSV                 |
| GET    | `/api/export/excel`   | Download Excel               |
