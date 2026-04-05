# Changelog

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
