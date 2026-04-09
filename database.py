"""
Database layer for the Mileage Tracker.

Supports two backends:
  - PostgreSQL (when DATABASE_URL is set) — used in production on Render
  - SQLite    (fallback)                  — used for local development

All database operations are exposed as functions so that app.py
never needs to write raw SQL.

Tables:
  - entries: mileage log entries scoped to user_id
  - users:   PIN-based authentication accounts
"""

import hashlib
import os
import secrets
from datetime import datetime

# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Render / Heroku sometimes use postgres:// but psycopg2 expects postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    import psycopg2
    import psycopg2.extras
    _BACKEND = "postgres"
else:
    import sqlite3
    _BACKEND = "sqlite"
    _DB_PATH = os.environ.get(
        "DB_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "mileage.db"),
    )

# Placeholder character for parameterised queries
_PH = "%s" if _BACKEND == "postgres" else "?"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _row_to_dict(row):
    """Convert a database row to a plain dict with JSON-safe values.

    PostgreSQL returns datetime objects for TIMESTAMP columns; we convert
    them to ISO strings so Flask's jsonify handles them without a custom
    JSON encoder.
    """
    if row is None:
        return None
    d = dict(row)
    for key, value in d.items():
        if isinstance(value, datetime):
            d[key] = value.strftime("%Y-%m-%d %H:%M:%S")
    return d


def _ph(n):
    """Return *n* placeholder strings joined by commas."""
    return ", ".join([_PH] * n)


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------
def get_db():
    """Return a new database connection.

    - PostgreSQL: uses RealDictCursor so rows behave like dicts.
    - SQLite: uses sqlite3.Row for the same effect.

    Callers must close the connection when done (use try/finally).
    """
    if _BACKEND == "postgres":
        conn = psycopg2.connect(
            DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        return conn
    else:
        conn = sqlite3.connect(_DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


# ---------------------------------------------------------------------------
# Schema initialisation
# ---------------------------------------------------------------------------
def init_db():
    """Create tables and indexes if they don't exist."""
    conn = get_db()

    if _BACKEND == "postgres":
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS entries (
                id SERIAL PRIMARY KEY,
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
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                pin_hash TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                last_login TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_entries_month_year
                ON entries(year, month)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_entries_user_id
                ON entries(user_id)
        """)
        conn.commit()
        cur.close()
        conn.close()
    else:
        # SQLite
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
                created_at TEXT NOT NULL
                    DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL
                    DEFAULT (datetime('now', 'localtime'))
            );

            CREATE INDEX IF NOT EXISTS idx_entries_month_year
                ON entries(year, month);
        """)
        conn.commit()

        # v1 → v2 migration: add user_id column to old databases
        _migrate_add_user_id(conn)

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id)"
        )
        conn.commit()

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                pin_hash TEXT NOT NULL,
                display_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
                    DEFAULT (datetime('now', 'localtime')),
                last_login TEXT NOT NULL
                    DEFAULT (datetime('now', 'localtime'))
            );
        """)
        conn.commit()
        conn.close()


def _migrate_add_user_id(conn):
    """Add user_id column if upgrading from v1 schema (SQLite only)."""
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
        cur = conn.cursor()
        cur.execute(
            f"SELECT id FROM users WHERE pin_hash = {_PH}", (pin_h,)
        )
        if cur.fetchone():
            return None

        cur.execute(
            f"""INSERT INTO users (id, pin_hash, display_name)
                VALUES ({_ph(3)})""",
            (user_id, pin_h, display_name.strip()),
        )
        conn.commit()

        cur.execute(
            f"SELECT * FROM users WHERE id = {_PH}", (user_id,)
        )
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def authenticate_user(pin):
    """Look up a user by PIN.

    Returns the user dict, or None if not found.
    Also updates last_login on success.
    """
    pin_h = hash_pin(pin)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT * FROM users WHERE pin_hash = {_PH}", (pin_h,)
        )
        user = cur.fetchone()
        if user:
            cur.execute(
                f"UPDATE users SET last_login = {_PH} WHERE id = {_PH}",
                (now, user["id"]),
            )
            conn.commit()
        return _row_to_dict(user)
    finally:
        conn.close()


def verify_user(user_id):
    """Look up a user by ID.

    Returns the user dict, or None if not found.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, display_name FROM users WHERE id = {_PH}",
            (user_id,),
        )
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_user_count():
    """Return the number of registered users."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) AS cnt FROM users")
        row = cur.fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


def get_user_display_name(user_id):
    """Return the display_name for a user, or '' if not found."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT display_name FROM users WHERE id = {_PH}",
            (user_id,),
        )
        row = cur.fetchone()
        return row["display_name"] if row else ""
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry CRUD
# ---------------------------------------------------------------------------
def get_entries(user_id, year, month):
    """Return all entries for a user/month/year, ordered by day then id."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""SELECT * FROM entries
                WHERE user_id = {_PH} AND year = {_PH} AND month = {_PH}
                ORDER BY day, id""",
            (user_id, year, month),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def create_entry(values_tuple):
    """Insert one entry.

    ``values_tuple`` must have 14 elements matching:
      (user_id, year, month, day, date, origin_branch, destination_branch,
       route_name, miles, reimbursement_amount, business_purpose, notes,
       created_at, updated_at)

    Returns the newly created entry as a dict.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = f"""
            INSERT INTO entries
                (user_id, year, month, day, date, origin_branch,
                 destination_branch, route_name, miles, reimbursement_amount,
                 business_purpose, notes, created_at, updated_at)
            VALUES ({_ph(14)})
        """

        if _BACKEND == "postgres":
            sql += " RETURNING *"
            cur.execute(sql, values_tuple)
            row = cur.fetchone()
            conn.commit()
            return _row_to_dict(row)
        else:
            cur.execute(sql, values_tuple)
            conn.commit()
            entry_id = cur.lastrowid
            cur.execute(
                f"SELECT * FROM entries WHERE id = {_PH}", (entry_id,)
            )
            return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def create_entries(values_list):
    """Insert multiple entries in one transaction.

    ``values_list`` is a list of 14-element tuples (same format as
    ``create_entry``).  Returns a list of created entry dicts.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        created = []
        for values_tuple in values_list:
            sql = f"""
                INSERT INTO entries
                    (user_id, year, month, day, date, origin_branch,
                     destination_branch, route_name, miles,
                     reimbursement_amount, business_purpose, notes,
                     created_at, updated_at)
                VALUES ({_ph(14)})
            """
            if _BACKEND == "postgres":
                sql += " RETURNING *"
                cur.execute(sql, values_tuple)
                created.append(_row_to_dict(cur.fetchone()))
            else:
                cur.execute(sql, values_tuple)
                entry_id = cur.lastrowid
                cur.execute(
                    f"SELECT * FROM entries WHERE id = {_PH}", (entry_id,)
                )
                created.append(_row_to_dict(cur.fetchone()))

        conn.commit()
        return created
    finally:
        conn.close()


def update_entry(entry_id, user_id, year, month, day, date_str, origin,
                 destination, route_name, miles, reimbursement, purpose,
                 notes):
    """Update an existing entry.  Returns the updated row or None."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""UPDATE entries
                SET year = {_PH}, month = {_PH}, day = {_PH}, date = {_PH},
                    origin_branch = {_PH}, destination_branch = {_PH},
                    route_name = {_PH}, miles = {_PH},
                    reimbursement_amount = {_PH}, business_purpose = {_PH},
                    notes = {_PH}, updated_at = {_PH}
                WHERE id = {_PH} AND user_id = {_PH}""",
            (year, month, day, date_str, origin, destination, route_name,
             miles, reimbursement, purpose, notes, now, entry_id, user_id),
        )
        conn.commit()

        cur.execute(
            f"SELECT * FROM entries WHERE id = {_PH} AND user_id = {_PH}",
            (entry_id, user_id),
        )
        return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def delete_entry(entry_id, user_id):
    """Delete a single entry.

    Returns True if the entry existed and was deleted, False otherwise.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id FROM entries WHERE id = {_PH} AND user_id = {_PH}",
            (entry_id, user_id),
        )
        if cur.fetchone() is None:
            return False

        cur.execute(
            f"DELETE FROM entries WHERE id = {_PH}", (entry_id,)
        )
        conn.commit()
        return True
    finally:
        conn.close()


def clear_month(user_id, year, month):
    """Delete all entries for a user/month/year.  Returns the count deleted."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""DELETE FROM entries
                WHERE user_id = {_PH} AND year = {_PH} AND month = {_PH}""",
            (user_id, year, month),
        )
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI bootstrap
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    print(f"Database initialized ({_BACKEND}).")
