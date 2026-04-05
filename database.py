"""
Database initialization and helper functions for the Mileage Tracker.
Uses SQLite for zero-config persistent storage.

v2: Added user_id column for multi-user support.
"""

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

    # Create the table (v2 schema with user_id).
    # If the table already exists from v1, this is a no-op — the
    # migration below will add the missing column.
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

    # Now that user_id column is guaranteed to exist, create its index
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id)"
    )
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


if __name__ == "__main__":
    init_db()
    print("Database initialized.")
