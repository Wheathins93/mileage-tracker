"""
Hardcoded mileage table and branch data.
This is the single source of truth for route distances.
"""

# All branch names
BRANCHES = ["Bellmead", "Plaza/Woodway", "Downtown", "Owen"]

# Mileage table: (origin, destination) -> list of {route, miles}
MILEAGE_TABLE = {
    ("Bellmead", "Plaza/Woodway"): [
        {"route": "I-35", "miles": 11.57},
    ],
    ("Bellmead", "Downtown"): [
        {"route": "I-35", "miles": 3.93},
    ],
    ("Bellmead", "Owen"): [
        {"route": "I-35", "miles": 11.4},
    ],
    ("Plaza/Woodway", "Bellmead"): [
        {"route": "I-35", "miles": 11.0},
    ],
    ("Plaza/Woodway", "Downtown"): [
        {"route": "Franklin", "miles": 5.2},
        {"route": "I-35", "miles": 7.9},
    ],
    ("Plaza/Woodway", "Owen"): [
        {"route": "Hwy 6", "miles": 0.5},
    ],
    ("Downtown", "Plaza/Woodway"): [
        {"route": "Franklin", "miles": 6.13},
        {"route": "I-35", "miles": 8.43},
    ],
    ("Downtown", "Bellmead"): [
        {"route": "I-35", "miles": 4.0},
    ],
    ("Downtown", "Owen"): [
        {"route": "Franklin", "miles": 5.3},
        {"route": "I-35", "miles": 8.1},
    ],
    ("Owen", "Bellmead"): [
        {"route": "I-35", "miles": 11.4},
    ],
    ("Owen", "Plaza/Woodway"): [
        {"route": "Hwy 6", "miles": 1.9},
    ],
    ("Owen", "Downtown"): [
        {"route": "I-35", "miles": 8.5},
        {"route": "Franklin", "miles": 5.6},
    ],
}

# 2026 IRS mileage reimbursement rate
REIMBURSEMENT_RATE = 0.725


def get_routes(origin, destination):
    """Get available routes between two branches."""
    key = (origin, destination)
    return MILEAGE_TABLE.get(key, [])


def get_route_miles(origin, destination, route_name):
    """Get miles for a specific route between two branches."""
    routes = get_routes(origin, destination)
    for r in routes:
        if r["route"] == route_name:
            return r["miles"]
    return None


def calculate_reimbursement(miles):
    """Calculate reimbursement amount, rounded to 2 decimals."""
    return round(miles * REIMBURSEMENT_RATE, 2)
