"""
Database initialization and helper functions for the Mileage Tracker.
Uses SQLite for zero-config persistent storage.
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mileage.db")


def get_db():
    """Get a database connection with row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    conn.close()


def seed_sample_data():
    """Insert sample data for demonstration. Only seeds if no data exists."""
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
    if count > 0:
        conn.close()
        return

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    year = 2026
    month = 4

    sample_entries = [
        (year, month, 1, f"{year}-04-01", "Bellmead", "Downtown", "I-35", 3.93,
         round(3.93 * 0.725, 2), "Branch visit for audit review", "", now, now),
        (year, month, 1, f"{year}-04-01", "Downtown", "Plaza/Woodway", "Franklin", 6.13,
         round(6.13 * 0.725, 2), "Team meeting at Plaza", "", now, now),
        (year, month, 2, f"{year}-04-02", "Plaza/Woodway", "Owen", "Hwy 6", 0.5,
         round(0.5 * 0.725, 2), "Cash delivery to Owen", "", now, now),
        (year, month, 2, f"{year}-04-02", "Owen", "Bellmead", "I-35", 11.4,
         round(11.4 * 0.725, 2), "Return to home branch", "", now, now),
        (year, month, 3, f"{year}-04-03", "Bellmead", "Owen", "I-35", 11.4,
         round(11.4 * 0.725, 2), "Training session at Owen", "", now, now),
    ]

    conn.executemany("""
        INSERT INTO entries (year, month, day, date, origin_branch, destination_branch,
            route_name, miles, reimbursement_amount, business_purpose, notes,
            created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_entries)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    seed_sample_data()
    print("Database initialized with sample data.")
