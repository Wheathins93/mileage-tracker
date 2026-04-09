"""
Mileage Tracker — Flask Application (v3)

Changes from v2:
- Replaced cookie-based user identity with PIN-based login
- Added /api/auth/register and /api/auth/login endpoints
- User identity sent via X-User-Id header from the frontend
- Removed cookie dependency entirely

Changes from v1:
- Multi-user support via user_id
- "Include return trip" creates two entries in one submit
- All queries scoped to the requesting user
"""

import csv
import io
import calendar
from datetime import datetime

from flask import Flask, render_template, request, jsonify, Response

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

from database import get_db, init_db, create_user, authenticate_user
from routes_data import (
    BRANCHES,
    MILEAGE_TABLE,
    REIMBURSEMENT_RATE,
    get_routes,
    get_route_miles,
    calculate_reimbursement,
)

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
with app.app_context():
    init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_user_id():
    """Read the user_id from the X-User-Id header set by the frontend."""
    return request.headers.get("X-User-Id", "").strip()


def require_user(f):
    """Decorator that returns 401 if no user_id header is present."""
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_user_id():
            return jsonify({"error": "Not authenticated. Please log in."}), 401
        return f(*args, **kwargs)

    return decorated


def _validate_entry(data):
    """Validate incoming entry data. Returns list of error strings."""
    errors = []
    if not data:
        return ["No data provided"]
    for field in (
        "year", "month", "day",
        "origin_branch", "destination_branch", "route_name",
    ):
        if not data.get(field):
            errors.append(f"'{field}' is required")
    if data.get("origin_branch") == data.get("destination_branch"):
        errors.append("Origin and destination must be different")
    return errors


def _build_entry_values(data, user_id, *, override_origin=None,
                        override_dest=None, override_route=None):
    """Build the tuple of values for an INSERT or UPDATE.

    Optional overrides let us reuse this for the return-trip entry.
    Returns (values_tuple, error_string_or_None).
    """
    origin = override_origin or data["origin_branch"]
    dest = override_dest or data["destination_branch"]
    route_name = override_route or data["route_name"]

    miles = get_route_miles(origin, dest, route_name)
    if miles is None:
        return None, "Invalid route selection"

    reimbursement = calculate_reimbursement(miles)
    year = int(data["year"])
    month = int(data["month"])
    day = int(data["day"])
    date_str = f"{year}-{month:02d}-{day:02d}"

    purpose = data.get("business_purpose", "").strip()
    if not purpose or override_origin:
        purpose = f"Mileage: {origin} to {dest} via {route_name}"

    notes = data.get("notes", "").strip()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return (
        user_id, year, month, day, date_str,
        origin, dest, route_name,
        miles, reimbursement, purpose, notes, now, now,
    ), None


INSERT_SQL = """
    INSERT INTO entries
        (user_id, year, month, day, date, origin_branch, destination_branch,
         route_name, miles, reimbursement_amount, business_purpose, notes,
         created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API — Authentication
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    """Register a new user with a PIN and display name."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    pin = data.get("pin", "").strip()
    display_name = data.get("display_name", "").strip()

    if not pin or not display_name:
        return jsonify({"error": "PIN and name are required"}), 400

    if not pin.isdigit() or len(pin) < 4 or len(pin) > 8:
        return jsonify({"error": "PIN must be 4–8 digits"}), 400

    user = create_user(pin, display_name)
    if user is None:
        return jsonify({
            "error": "That PIN is already in use. Please choose a different one."
        }), 409

    return jsonify({
        "user_id": user["id"],
        "display_name": user["display_name"],
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    """Log in with a PIN."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    pin = data.get("pin", "").strip()
    if not pin:
        return jsonify({"error": "PIN is required"}), 400

    user = authenticate_user(pin)
    if user is None:
        return jsonify({"error": "Invalid PIN. Please try again."}), 401

    return jsonify({
        "user_id": user["id"],
        "display_name": user["display_name"],
    })


@app.route("/api/auth/verify", methods=["POST"])
def api_verify():
    """Verify that a stored user_id is still valid."""
    data = request.get_json()
    if not data:
        return jsonify({"valid": False}), 400

    user_id = data.get("user_id", "").strip()
    if not user_id:
        return jsonify({"valid": False}), 400

    conn = get_db()
    user = conn.execute(
        "SELECT id, display_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if user:
        return jsonify({
            "valid": True,
            "user_id": user["id"],
            "display_name": user["display_name"],
        })
    return jsonify({"valid": False}), 401


# ---------------------------------------------------------------------------
# API — Reference Data
# ---------------------------------------------------------------------------
@app.route("/api/branches")
def api_branches():
    return jsonify(BRANCHES)


@app.route("/api/routes")
def api_routes():
    origin = request.args.get("origin")
    destination = request.args.get("destination")
    if not origin or not destination:
        return jsonify([])
    return jsonify(get_routes(origin, destination))


@app.route("/api/mileage-table")
def api_mileage_table():
    """Return the full mileage table for the reference card."""
    table = []
    for (origin, dest), routes in MILEAGE_TABLE.items():
        for r in routes:
            table.append({
                "origin": origin,
                "destination": dest,
                "route": r["route"],
                "miles": r["miles"],
                "reimbursement": calculate_reimbursement(r["miles"]),
            })
    return jsonify(table)


@app.route("/api/rate")
def api_rate():
    return jsonify({"rate": REIMBURSEMENT_RATE})


# ---------------------------------------------------------------------------
# API — CRUD (all scoped to user_id)
# ---------------------------------------------------------------------------
@app.route("/api/entries")
@require_user
def api_entries():
    """Get entries for a given month/year, scoped to the current user."""
    user_id = get_user_id()

    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400

    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM entries
           WHERE user_id = ? AND year = ? AND month = ?
           ORDER BY day, id""",
        (user_id, year, month),
    ).fetchall()
    conn.close()

    entries = [dict(r) for r in rows]
    total_miles = round(sum(e["miles"] for e in entries), 2)
    total_reimbursement = round(
        sum(e["reimbursement_amount"] for e in entries), 2
    )

    return jsonify({
        "entries": entries,
        "summary": {
            "total_entries": len(entries),
            "total_miles": total_miles,
            "total_reimbursement": total_reimbursement,
        },
    })


@app.route("/api/entries", methods=["POST"])
@require_user
def api_create_entry():
    """Create a new mileage entry, optionally with a return trip."""
    user_id = get_user_id()

    data = request.get_json()
    errors = _validate_entry(data)
    if errors:
        return jsonify({"errors": errors}), 400

    values, err = _build_entry_values(data, user_id)
    if err:
        return jsonify({"errors": [err]}), 400

    conn = get_db()
    created = []

    # --- Main entry ---
    cursor = conn.execute(INSERT_SQL, values)
    main_id = cursor.lastrowid
    main_row = conn.execute(
        "SELECT * FROM entries WHERE id = ?", (main_id,)
    ).fetchone()
    created.append(dict(main_row))

    # --- Return trip (if requested) ---
    if data.get("include_return"):
        return_routes = get_routes(
            data["destination_branch"], data["origin_branch"]
        )
        if return_routes:
            # Prefer same route name for the return; fall back to first
            return_route = next(
                (r for r in return_routes
                 if r["route"] == data["route_name"]),
                return_routes[0],
            )

            ret_values, ret_err = _build_entry_values(
                data, user_id,
                override_origin=data["destination_branch"],
                override_dest=data["origin_branch"],
                override_route=return_route["route"],
            )
            if ret_values and not ret_err:
                cursor2 = conn.execute(INSERT_SQL, ret_values)
                ret_id = cursor2.lastrowid
                ret_row = conn.execute(
                    "SELECT * FROM entries WHERE id = ?", (ret_id,)
                ).fetchone()
                created.append(dict(ret_row))

    conn.commit()
    conn.close()

    return jsonify({"entries": created, "count": len(created)}), 201


@app.route("/api/entries/<int:entry_id>", methods=["PUT"])
@require_user
def api_update_entry(entry_id):
    """Update an existing entry (must belong to the current user)."""
    user_id = get_user_id()

    data = request.get_json()
    errors = _validate_entry(data)
    if errors:
        return jsonify({"errors": errors}), 400

    miles = get_route_miles(
        data["origin_branch"], data["destination_branch"], data["route_name"]
    )
    if miles is None:
        return jsonify({"errors": ["Invalid route selection"]}), 400

    reimbursement = calculate_reimbursement(miles)
    year = int(data["year"])
    month = int(data["month"])
    day = int(data["day"])
    date_str = f"{year}-{month:02d}-{day:02d}"
    purpose = data.get("business_purpose", "").strip()
    if not purpose:
        purpose = (
            f"Mileage: {data['origin_branch']} to "
            f"{data['destination_branch']} via {data['route_name']}"
        )
    notes = data.get("notes", "").strip()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db()
    conn.execute(
        """UPDATE entries
           SET year = ?, month = ?, day = ?, date = ?, origin_branch = ?,
               destination_branch = ?, route_name = ?, miles = ?,
               reimbursement_amount = ?, business_purpose = ?, notes = ?,
               updated_at = ?
           WHERE id = ? AND user_id = ?""",
        (year, month, day, date_str, data["origin_branch"],
         data["destination_branch"], data["route_name"], miles,
         reimbursement, purpose, notes, now, entry_id, user_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    ).fetchone()
    conn.close()

    if row is None:
        return jsonify({"error": "Entry not found"}), 404
    return jsonify(dict(row))


@app.route("/api/entries/<int:entry_id>", methods=["DELETE"])
@require_user
def api_delete_entry(entry_id):
    """Delete a single entry (must belong to the current user)."""
    user_id = get_user_id()

    conn = get_db()
    row = conn.execute(
        "SELECT id FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, user_id),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Entry not found"}), 404
    conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": entry_id})


@app.route("/api/entries/clear", methods=["POST"])
@require_user
def api_clear_month():
    """Delete all entries for a given month/year for the current user."""
    user_id = get_user_id()

    data = request.get_json()
    year = data.get("year")
    month = data.get("month")
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400

    conn = get_db()
    result = conn.execute(
        "DELETE FROM entries WHERE user_id = ? AND year = ? AND month = ?",
        (user_id, year, month),
    )
    conn.commit()
    conn.close()
    return jsonify({"deleted_count": result.rowcount})


# ---------------------------------------------------------------------------
# API — Export (scoped to user_id)
# ---------------------------------------------------------------------------
@app.route("/api/export/csv")
@require_user
def api_export_csv():
    """Export entries for a month as CSV."""
    user_id = get_user_id()
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400

    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM entries
           WHERE user_id = ? AND year = ? AND month = ?
           ORDER BY day, id""",
        (user_id, year, month),
    ).fetchall()
    conn.close()

    month_name = calendar.month_name[month]
    filename = f"mileage_{month_name}_{year}.csv"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Day", "From", "To", "Route", "Miles",
        "Reimbursement ($)", "Business Purpose", "Notes",
    ])
    total_miles = 0
    total_reimb = 0
    for r in rows:
        writer.writerow([
            r["date"], r["day"], r["origin_branch"],
            r["destination_branch"], r["route_name"], r["miles"],
            f"{r['reimbursement_amount']:.2f}",
            r["business_purpose"], r["notes"],
        ])
        total_miles += r["miles"]
        total_reimb += r["reimbursement_amount"]
    writer.writerow([])
    writer.writerow([
        "", "", "", "", "TOTALS",
        f"{total_miles:.2f}", f"{total_reimb:.2f}", "", "",
    ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.route("/api/export/excel")
@require_user
def api_export_excel():
    """Export entries as an Excel reimbursement form."""
    user_id = get_user_id()
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400

    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM entries
           WHERE user_id = ? AND year = ? AND month = ?
           ORDER BY day, id""",
        (user_id, year, month),
    ).fetchall()
    conn.close()

    month_name = calendar.month_name[month]
    filename = f"mileage_reimbursement_{month_name}_{year}.xlsx"

    wb = Workbook()
    ws = wb.active
    ws.title = "Mileage Reimbursement"

    # Styles
    title_font = Font(name="Calibri", size=16, bold=True, color="1a1a2e")
    subtitle_font = Font(name="Calibri", size=11, color="555555")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    header_fill = PatternFill(
        start_color="2d3a4a", end_color="2d3a4a", fill_type="solid"
    )
    data_font = Font(name="Calibri", size=10)
    total_font = Font(name="Calibri", size=11, bold=True, color="1a1a2e")
    total_fill = PatternFill(
        start_color="e8f0fe", end_color="e8f0fe", fill_type="solid"
    )
    thin_border = Border(
        left=Side(style="thin", color="cccccc"),
        right=Side(style="thin", color="cccccc"),
        top=Side(style="thin", color="cccccc"),
        bottom=Side(style="thin", color="cccccc"),
    )

    # Column widths
    for i, w in enumerate([14, 6, 18, 18, 12, 10, 16, 35, 25], 1):
        ws.column_dimensions[chr(64 + i)].width = w

    # Title
    ws.merge_cells("A1:I1")
    ws["A1"] = "Mileage Reimbursement Report"
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(horizontal="center")

    # Subtitle
    ws.merge_cells("A2:I2")
    ws["A2"] = f"{month_name} {year}  •  Rate: ${REIMBURSEMENT_RATE}/mile"
    ws["A2"].font = subtitle_font
    ws["A2"].alignment = Alignment(horizontal="center")

    # Headers
    headers = [
        "Date", "Day", "From", "To", "Route",
        "Miles", "Reimbursement", "Business Purpose", "Notes",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    # Data
    total_miles = 0
    total_reimb = 0
    for i, r in enumerate(rows):
        row_num = 5 + i
        values = [
            r["date"], r["day"], r["origin_branch"],
            r["destination_branch"], r["route_name"],
            r["miles"], r["reimbursement_amount"],
            r["business_purpose"], r["notes"],
        ]
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row_num, column=col, value=val)
            cell.font = data_font
            cell.border = thin_border
            if col == 6:
                cell.number_format = "0.00"
            elif col == 7:
                cell.number_format = '"$"#,##0.00'
        total_miles += r["miles"]
        total_reimb += r["reimbursement_amount"]

    # Totals
    total_row = 5 + len(rows)
    ws.cell(row=total_row, column=5, value="TOTALS").font = total_font
    ws.cell(row=total_row, column=5).alignment = Alignment(horizontal="right")

    miles_cell = ws.cell(
        row=total_row, column=6, value=round(total_miles, 2)
    )
    miles_cell.font = total_font
    miles_cell.fill = total_fill
    miles_cell.border = thin_border
    miles_cell.number_format = "0.00"

    reimb_cell = ws.cell(
        row=total_row, column=7, value=round(total_reimb, 2)
    )
    reimb_cell.font = total_font
    reimb_cell.fill = total_fill
    reimb_cell.border = thin_border
    reimb_cell.number_format = '"$"#,##0.00'

    # Signature
    sig_row = total_row + 3
    ws.merge_cells(f"A{sig_row}:D{sig_row}")
    ws[f"A{sig_row}"] = "Employee Signature: ________________________"
    ws[f"A{sig_row}"].font = Font(
        name="Calibri", size=10, color="333333"
    )
    ws.merge_cells(f"F{sig_row}:I{sig_row}")
    ws[f"F{sig_row}"] = "Date: ________________________"
    ws[f"F{sig_row}"].font = Font(
        name="Calibri", size=10, color="333333"
    )

    ws.print_title_rows = "1:4"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return Response(
        buf.getvalue(),
        mimetype=(
            "application/vnd.openxmlformats-officedocument"
            ".spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
