# Mileage Tracker — Branch Travel Reimbursement

A lightweight web app for tracking mileage between bank branches and calculating expense reimbursements.

## Features

- **Quick Entry** — Select origin/destination branches and routes from dropdowns; miles and reimbursement auto-calculate
- **Multiple Entries Per Day** — Add as many trips as needed for any given day
- **Monthly View** — See all entries for a selected month with running totals
- **Edit / Delete / Duplicate** — Full CRUD on every entry with confirmation dialogs
- **CSV Export** — Download a clean CSV of the month's entries
- **Excel Export** — Download a formatted reimbursement form (.xlsx) with totals and signature line
- **Reset Month** — Clear all entries for a month when you're ready to start fresh
- **Filter by Day** — Quickly filter the table to a specific day
- **Auto-generated Purpose** — If you leave "Business Purpose" blank, it auto-fills (e.g., "Mileage: Bellmead to Downtown via I-35")
- **Printable** — Use Ctrl/Cmd+P for a clean print layout
- **Mobile Friendly** — Responsive design works on phones and tablets

## Tech Stack

| Layer     | Technology       |
|-----------|------------------|
| Backend   | Python / Flask   |
| Database  | SQLite           |
| Frontend  | HTML / CSS / JS  |
| Excel     | openpyxl         |

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

The app will start at **http://127.0.0.1:5000**

### 4. Open in Browser

Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000)

Sample data for April 2026 is pre-loaded so you can see how it works right away.

## Project Structure

```
Mileage tracker/
├── app.py              # Flask application & API routes
├── database.py         # SQLite schema, init, seed data
├── routes_data.py      # Mileage table & reimbursement logic
├── requirements.txt    # Python dependencies
├── mileage.db          # SQLite database (created on first run)
├── templates/
│   └── index.html      # Main page template
├── static/
│   ├── css/
│   │   └── style.css   # All styles
│   └── js/
│       └── app.js      # Frontend logic
└── README.md
```

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

1. **Select Month/Year** — Use the arrows or dropdowns at the top
2. **Add Entry** — Pick the day, from/to branches, and route → miles fill automatically
3. **Save** — Click "Save Entry" to store it
4. **Review** — Entries appear in the table below with running totals
5. **Export** — Click CSV or Excel to download your reimbursement report
6. **Reset** — Click Reset to clear the month after submitting your expense report

## API Reference

| Method | Endpoint              | Description                  |
|--------|-----------------------|------------------------------|
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
