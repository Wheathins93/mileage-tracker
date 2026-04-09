"""
Database initialization and helper functions for the Mileage Tracker.
Uses SQLite for zero-config persistent storage.

Tables:
  - entries: mileage log entries scoped to user_id
  - users:   PIN-based authentication accounts
"""

import hashlib
import secrets
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mileage.db")


def get_db():
    """Get a database connection with row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist, and run migrations."""
    conn = get_db()

    # Entries table
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            day INTEGER NOT NULL,
            date TEXT NOT NULL,
            origin_branch TEXT NOT NULL,
            destination_branch TEXT NOT NULL,
            route_name TEXT NOT NULL,
            miles REAL NOT NULL,
            reimbursement_amount REAL NOT NULL,
            business_purpose TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_entries_month_year
            ON entries(year, month);
    """)
    conn.commit()

    # v1 → v2 migration: add user_id column to existing databases
    _migrate_add_user_id(conn)

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id)"
    )
    conn.commit()

    # Users table for PIN-based auth
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            pin_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_login TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
    """)
    conn.commit()
    conn.close()


def _migrate_add_user_id(conn):
    """Add user_id column if upgrading from v1 schema."""
    cursor = conn.execute("PRAGMA table_info(entries)")
    columns = [row[1] for row in cursor.fetchall()]
    if "user_id" not in columns:
        conn.execute(
            "ALTER TABLE entries ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"
        )
        conn.commit()


# ---------------------------------------------------------------------------
# User / PIN helpers
# ---------------------------------------------------------------------------
def hash_pin(pin):
    """Hash a PIN using SHA-256 with a fixed app-level salt.

    This is sufficient for short PINs in a low-stakes personal tool.
    A global salt prevents rainbow tables while keeping lookups simple.
    """
    salted = f"mileage-tracker:{pin}"
    return hashlib.sha256(salted.encode()).hexdigest()


def create_user(pin, display_name):
    """Create a new user with the given PIN and display name.

    Returns the new user dict, or None if the PIN is already taken.
    """
    pin_h = hash_pin(pin)
    user_id = secrets.token_hex(16)

    conn = get_db()
    try:
        # Ensure PIN is unique
        existing = conn.execute(
            "SELECT id FROM users WHERE pin_hash = ?", (pin_h,)
        ).fetchone()
        if existing:
            conn.close()
            return None

        conn.execute(
            """INSERT INTO users (id, pin_hash, display_name)
               VALUES (?, ?, ?)""",
            (user_id, pin_h, display_name.strip()),
        )
        conn.commit()
        user = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(user) if user else None
    finally:
        conn.close()


def authenticate_user(pin):
    """Look up a user by PIN.

    Returns the user dict, or None if not found.
    """
    pin_h = hash_pin(pin)

    conn = get_db()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE pin_hash = ?", (pin_h,)
        ).fetchone()
        if user:
            conn.execute(
                "UPDATE users SET last_login = datetime('now', 'localtime') WHERE id = ?",
                (user["id"],),
            )
            conn.commit()
        return dict(user) if user else None
    finally:
        conn.close()


def get_user_count():
    """Return the number of registered users."""
    conn = get_db()
    try:
        row = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()
        return row["cnt"]
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized.")
