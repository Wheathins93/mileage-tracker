# Changelog

## v4.0.0 — Mobile-First Redesign & Bug Fixes (2026-04-09)

### Bugs Fixed
- **iOS white screen after Excel download** — On iPhone home-screen web apps, dismissing the Excel download popup left a white screen with no way back. Root cause: `URL.createObjectURL()` + `<a>.click()` navigated the iOS standalone WebKit view away from the app. Fix: detect iOS standalone mode and use a hidden iframe for downloads instead, keeping the main app view intact.
- **PIN login "no user exists"** — Improved error messaging to distinguish between "wrong PIN" and "no account found", directing users to register if needed. Added a note in README about Render.com's ephemeral filesystem wiping the SQLite DB on each deploy (the root cause for deployed environments).
- **Mobile layout requires zoom-out** — Complete CSS rewrite with mobile-first approach. The UI now fits iPhone screens without any need to zoom out.

### Changes
- **Mobile-first CSS** — All styles now start from the smallest screen (320px+), scaling up via `min-width` media queries at 480px and 768px breakpoints. Previously used desktop-first with a single `max-width: 640px` breakpoint.
- **iOS safe-area support** — Added `viewport-fit=cover` and `env(safe-area-inset-*)` padding for notched iPhones.
- **Prevent iOS zoom on input focus** — All text inputs and selects use `font-size: 16px` to prevent Safari's auto-zoom behavior.
- **Touch-optimized** — All interactive elements meet 44px minimum touch target. Added `:active` states for mobile feedback.
- **Summary cards** — Stack vertically on phones, horizontal row on tablet+.
- **Purpose column** — Hidden on mobile to save table width, visible on desktop.
- **Toast notifications** — Centered on mobile, bottom-right on desktop.
- **Download toast text** — Changed from past-tense "downloaded" to "downloading…" for accuracy.

### Code Quality
- **Resource leak fixes** — All `get_db()` connections now wrapped in `try/finally` blocks across `app.py` and `database.py` to ensure cleanup on exceptions.
- **Import cleanup** — Moved `from functools import wraps` to top-level imports instead of inside the decorator function.
- **Removed legacy comments** — Cleaned up v1/v2/v3 changelog comments scattered throughout Python and JS source files.
- **Removed unused code** — Removed `$$` selector alias (never used), `.checkbox-custom` span (display:none), leftover CSS version markers.
- **README updated** — Added Render.com persistence warning, updated project structure, changed "Mobile Friendly" → "Mobile First".

### Technical
- `style.css`: Complete rewrite — mobile-first with `min-width` breakpoints; iOS safe-area insets; consistent touch targets
- `app.js`: iOS standalone detection via `navigator.standalone`; iframe-based download for iOS; removed unused `$$` helper
- `app.py`: All DB connections use try/finally; improved login error message; top-level `wraps` import
- `database.py`: try/finally on all connections; added `get_user_count()` helper; cleaned docstrings
- `index.html`: Added `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`; added `theme-color` and `mobile-web-app-capable` metas; added `purpose-col` class to table header

---

## v3.1.0 — Official Expense Template Export (2026-04-09)

### Changes
- **Excel export now uses the official American Bank Expense Statement template** (`Blank Expense Reimbursement Form - 2026.xlsx`). Exports preserve the bank's exact formatting, logo placeholder, account codes (#455160, #455370, #455120), and approval/ACH sections.
- User's display name auto-fills the **Name** field (cell B5)
- Entry dates are written as proper `datetime` values so the template's `m/d/yy` format applies correctly
- **Description** column (B) shows `"{origin} to {destination} via {route}"`
- **Business Purpose** column (C) is mapped from the tracker's purpose field
- **Miles** column (D) is filled numerically — the template's `=D{n}*0.725` formula in column E auto-calculates reimbursement
- All existing formulas (`=D*0.725`, `=SUM(E:I)`, TOTALS row) are preserved
- If more than 10 entries exist, extra rows are dynamically inserted with cloned formatting and formulas
- Replaced the old custom-built Excel export entirely — no more `Workbook()` from scratch

### Technical
- `app.py`: `api_export_excel()` now uses `load_workbook(TEMPLATE_PATH)` instead of building a sheet from scratch
- Removed unused `openpyxl.styles` imports (Font, Alignment, Border, Side, PatternFill)
- Added `copy` and `os` imports for style cloning and template path resolution
- Template file included in repo as `Blank Expense Reimbursement Form - 2026.xlsx`

---

## v3.0.0 — PIN-Based Login (2026-04-09)

### Problem Solved
Cookie-based user identity was unreliable on iOS Home Screen web apps. Safari's Intelligent Tracking Prevention (ITP) and WebKit storage policies purge cookies and localStorage after ~7 days of inactivity, causing users to lose their session and data association.

### New Features
- **PIN-based login**: Users create a 4–8 digit PIN on first use. Data is tied to the PIN on the server, not to browser storage. If storage is ever cleared, simply re-enter your PIN to get back to your data.
- **Simple registration**: Enter your name and choose a PIN — that's it. No email, no password complexity.
- **User badge**: Your name appears in the header with a one-tap sign-out button.
- **Session verification**: On load, the app verifies your stored session is still valid. If storage was purged, you're prompted to re-login (no data lost).
- **iOS web app meta tags**: Added `apple-mobile-web-app-capable` and related meta tags for better Home Screen behavior.

### Changes
- User identity sent via `X-User-Id` header instead of cookies
- Server-side PIN hashing (SHA-256 with app-level salt)
- Added `users` table in SQLite for persistent user accounts
- Added `@require_user` decorator for consistent auth enforcement
- Export downloads use `fetch` + Blob approach to include auth header
- Auth and tracker event bindings separated to prevent duplicate listeners
- Footer text updated from "per-browser session" to "personal PIN"

### Technical
- New endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/verify`
- `database.py`: Added `users` table, `create_user()`, `authenticate_user()`, `hash_pin()`
- Frontend auth flow: localStorage stores `mileage_user_id` + `mileage_display_name`; verified against server on each page load
- Cookie reading (`request.cookies`) replaced with header reading (`request.headers`)
- Backward-compatible with existing v2 `entries` table schema

---

## v2.0.0 — Multi-User & Quality of Life (2026-04-04)

### New Features
- **Multi-user support**: Each browser gets its own isolated tracker via a UUID cookie. No login required — data is automatically separated per browser session.
- **"Include return trip" checkbox**: When adding an entry, check this box to automatically create a second entry for the drive back. The app finds the best matching return route and previews it before you submit.
- **Home branch setting**: Set your home/office branch once and it auto-fills the "From" field on every new entry. Stored in your browser's localStorage.
- **Swap branches button**: Quick ⇄ button next to the "To" field to swap origin and destination with one click.
- **Keyboard shortcut**: Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) to submit the form without clicking.
- **Stat animations**: Summary card values now pop when they update, giving visual feedback that your data changed.

### Changes
- All database queries are now scoped to the requesting user's ID
- Entries from different browsers/users are fully isolated
- Form button text changes to "Save 2 Entries" when return trip is checked
- Return trip row hides during edit mode (only applies to new entries)
- Database migration automatically adds `user_id` column to existing v1 databases
- Removed auto-seeding of sample data (each user starts with a clean tracker)
- Added `user_id` index on entries table for query performance
- Print and responsive styles updated to include new elements

### Technical
- User identity: `crypto.randomUUID()` stored in both localStorage and a 1-year cookie
- Cookie name: `user_id`, read server-side via `request.cookies`
- Return trip logic: server creates both entries in a single POST, preferring the same route name for the return leg
- Added `gunicorn` to requirements for Render deployment

---

## v1.0.0 — Initial Release (2026-04-04)

### Features
- Full mileage tracking with branch-to-branch route selection
- Hardcoded mileage table for 4 branches (Bellmead, Plaza/Woodway, Downtown, Owen)
- Multiple entries per day
- Edit, delete, and duplicate entries
- Monthly view with summary cards (entries, miles, reimbursement)
- CSV export
- Excel export (formatted reimbursement form with signature line)
- Reset month with confirmation dialog
- Filter by day
- Auto-generated business purpose descriptions
- Collapsible mileage reference table
- Mobile-responsive design
- Print-friendly layout
- SQLite database with zero-config setup
