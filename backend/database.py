import sqlite3
import os
from datetime import datetime
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "alerts.db")

def get_conn() -> sqlite3.Connection:
    """Get a thread-safe SQLite connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database schema and seed default users if empty."""
    conn = get_conn()
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL CHECK(role IN ('citizen','officer','commissioner','patrol')),
            full_name     TEXT NOT NULL,
            phone         TEXT,
            vehicle_id    INTEGER,
            created_at    TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            citizen_id            INTEGER NOT NULL REFERENCES users(id),
            alert_type            TEXT NOT NULL CHECK(alert_type IN ('sos','harassment','suspicious','medical','other')),
            description           TEXT,
            lat                   REAL NOT NULL,
            lng                   REAL NOT NULL,
            status                TEXT NOT NULL DEFAULT 'pending'
                                  CHECK(status IN ('pending','acknowledged','dispatched','on_scene','resolved','cancelled')),
            dispatched_vehicle_id INTEGER,
            acknowledged_by       INTEGER REFERENCES users(id),
            resolved_by           INTEGER REFERENCES users(id),
            eta_minutes           INTEGER,
            report_type           TEXT CHECK(report_type IN ('DSR','CSR')) DEFAULT NULL,
            report_notes          TEXT DEFAULT NULL,
            created_at            TEXT DEFAULT (datetime('now')),
            updated_at            TEXT DEFAULT (datetime('now')),
            resolved_at           TEXT
        )
    """)

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS alerts_update_ts AFTER UPDATE ON alerts
        BEGIN UPDATE alerts SET updated_at = datetime('now') WHERE id = NEW.id; END
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alert_locations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id    INTEGER NOT NULL REFERENCES alerts(id),
            lat         REAL NOT NULL,
            lng         REAL NOT NULL,
            recorded_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── Phase 2B tables ────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patrol_telemetry (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id  INTEGER NOT NULL,
            lat         REAL NOT NULL,
            lng         REAL NOT NULL,
            status      TEXT NOT NULL,
            km_delta    REAL DEFAULT 0,
            recorded_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incident_reports (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            report_type  TEXT NOT NULL CHECK(report_type IN ('dsr','csr','fir')),
            crime_head   TEXT NOT NULL,
            description  TEXT,
            place        TEXT,
            lat          REAL,
            lng          REAL,
            status       TEXT NOT NULL DEFAULT 'open'
                         CHECK(status IN ('open','escalated','chargesheet','closed')),
            escalated_to TEXT,
            alert_id     INTEGER REFERENCES alerts(id),
            created_by   INTEGER NOT NULL REFERENCES users(id),
            reviewed_by  INTEGER REFERENCES users(id),
            created_at   TEXT DEFAULT (datetime('now')),
            updated_at   TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS reports_update_ts AFTER UPDATE ON incident_reports
        BEGIN UPDATE incident_reports SET updated_at = datetime('now') WHERE id = NEW.id; END
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fop_volunteers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            area        TEXT,
            verified    INTEGER DEFAULT 0,
            verified_by INTEGER REFERENCES users(id),
            created_at  TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alert_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id    INTEGER NOT NULL REFERENCES alerts(id),
            sender_id   INTEGER NOT NULL REFERENCES users(id),
            sender_role TEXT NOT NULL,
            body        TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.commit()

    # Seed default users if empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        _seed_default_users(conn)
    else:
        _ensure_commissioner_user(conn)

    conn.close()

def _seed_default_users(conn: sqlite3.Connection):
    """Seed default officer, commissioner, citizen, and patrol accounts."""
    from backend.auth import hash_password

    cursor = conn.cursor()
    # (username, password_hash, role, full_name, phone, vehicle_id)
    users = [
        # Command Centre officers (SSF)
        ("officer1", hash_password("officer1pass"), "officer", "SI Murugan", "9841000001", None),
        ("officer2", hash_password("officer2pass"), "officer", "SI Yoganandham", "9841000002", None),
        # Commissioner
        ("commissioner1", hash_password("comm1pass"), "commissioner", "Commissioner Sanjay Kumar IPS", "9841000003", None),
        # Citizens
        ("citizen1", hash_password("citizen1pass"), "citizen", "Ananya Krishnan", "9841000011", None),
        ("citizen2", hash_password("citizen2pass"), "citizen", "Meena Selvam", "9841000012", None),
        ("citizen3", hash_password("citizen3pass"), "citizen", "Deepa Venkatesh", "9841000013", None),
        # Patrol officers — each mapped to a SSF vehicle
        ("patrol1", hash_password("patrol1pass"), "patrol", "Const. Ravi Kumar",   "9841000021", 1),
        ("patrol2", hash_password("patrol2pass"), "patrol", "Const. Kavitha Devi", "9841000022", 2),
        ("patrol3", hash_password("patrol3pass"), "patrol", "Const. Arjun Singh",  "9841000023", 3),
        ("patrol4", hash_password("patrol4pass"), "patrol", "Const. Meena Rani",   "9841000024", 4),
    ]

    cursor.executemany(
        "INSERT INTO users (username, password_hash, role, full_name, phone, vehicle_id) VALUES (?,?,?,?,?,?)",
        users
    )
    conn.commit()
    _seed_demo_alerts(conn)
    _seed_demo_telemetry(conn)


def _seed_demo_alerts(conn: sqlite3.Connection):
    """Seed 12 demo alerts across Tambaram subdivision (skipped if alerts already exist)."""
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM alerts")
    if cursor.fetchone()[0] > 0:
        return

    # citizen IDs are 4, 5, 6 (inserted after 2 officers + 1 commissioner)
    alerts = [
        # (citizen_id, alert_type, description, lat, lng, status, dispatched_vehicle_id, eta_minutes)
        (4, "sos",         "Help needed urgently",          12.9249, 80.1000, "pending",      None, None),
        (5, "harassment",  "Being followed near bus stand", 12.9657, 80.1588, "pending",      None, None),
        (6, "suspicious",  "Unknown men loitering",         12.9062, 80.1490, "pending",      None, None),
        (4, "medical",     "Accident victim on road",       12.9314, 80.1496, "acknowledged", None, None),
        (5, "sos",         "Need immediate assistance",     12.9344, 80.2120, "acknowledged", None, None),
        (6, "harassment",  "Verbal abuse at market",        12.9480, 80.2360, "acknowledged", None, None),
        (4, "suspicious",  "Abandoned bag near school",     12.9132, 80.1903, "dispatched",   1,    6),
        (5, "sos",         "Child missing from park",       12.9217, 80.1950, "dispatched",   2,    8),
        (6, "medical",     "Woman collapsed on street",     12.8900, 80.1300, "dispatched",   1,    5),
        (4, "harassment",  "Eve-teasing near college",      12.9400, 80.1750, "resolved",     None, None),
        (5, "other",       "Loud altercation at night",     12.9550, 80.2000, "resolved",     None, None),
        (6, "other",       "Stray dog attack",              12.9100, 80.1700, "pending",      None, None),
    ]

    cursor.executemany(
        """INSERT INTO alerts
           (citizen_id, alert_type, description, lat, lng, status, dispatched_vehicle_id, eta_minutes)
           VALUES (?,?,?,?,?,?,?,?)""",
        alerts,
    )
    conn.commit()


def _seed_demo_telemetry(conn: sqlite3.Connection):
    """Seed 8 hours of realistic patrol routes for all 4 vehicles (demo use).
    Each vehicle follows a zigzag street pattern through its zone with 2 stops >30 min.
    Points at 1-min intervals, shift starts 8h 30min before current time.
    """
    import math, random as _rnd
    _rnd.seed(42)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM patrol_telemetry")
    if cursor.fetchone()[0] > 0:
        return

    def _haversine(la1, lo1, la2, lo2):
        R = 6371
        dlat = math.radians(la2 - la1)
        dlng = math.radians(lo2 - lo1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(la1))*math.cos(math.radians(la2))*math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    # Realistic patrol waypoints following major roads in each zone
    ROUTES = {
        1: [(12.9428,80.1310),(12.9460,80.1295),(12.9490,80.1270),(12.9510,80.1320),
            (12.9480,80.1380),(12.9440,80.1410),(12.9390,80.1400),(12.9350,80.1370),
            (12.9320,80.1330),(12.9340,80.1270),(12.9370,80.1240),(12.9400,80.1260),
            (12.9420,80.1290),(12.9428,80.1310),(12.9460,80.1295),(12.9490,80.1270),
            (12.9500,80.1320),(12.9470,80.1360),(12.9420,80.1390),(12.9380,80.1350),
            (12.9360,80.1300),(12.9390,80.1270),(12.9410,80.1290),(12.9428,80.1310)],
        2: [(12.9670,80.1600),(12.9700,80.1570),(12.9730,80.1530),(12.9760,80.1560),
            (12.9790,80.1610),(12.9820,80.1650),(12.9800,80.1700),(12.9760,80.1720),
            (12.9720,80.1700),(12.9690,80.1650),(12.9660,80.1620),(12.9640,80.1580),
            (12.9610,80.1540),(12.9640,80.1510),(12.9670,80.1510),(12.9700,80.1540),
            (12.9720,80.1570),(12.9750,80.1600),(12.9780,80.1640),(12.9760,80.1680),
            (12.9720,80.1660),(12.9690,80.1630),(12.9670,80.1600)],
        3: [(12.9310,80.1500),(12.9340,80.1470),(12.9370,80.1440),(12.9400,80.1460),
            (12.9420,80.1510),(12.9410,80.1560),(12.9380,80.1590),(12.9350,80.1560),
            (12.9320,80.1530),(12.9290,80.1510),(12.9270,80.1470),(12.9280,80.1430),
            (12.9300,80.1410),(12.9310,80.1450),(12.9330,80.1490),(12.9360,80.1510),
            (12.9390,80.1540),(12.9410,80.1570),(12.9390,80.1600),(12.9360,80.1580),
            (12.9330,80.1550),(12.9310,80.1520),(12.9310,80.1500)],
        4: [(12.9344,80.2120),(12.9380,80.2090),(12.9410,80.2060),(12.9440,80.2030),
            (12.9460,80.2080),(12.9470,80.2140),(12.9450,80.2190),(12.9420,80.2210),
            (12.9390,80.2200),(12.9360,80.2180),(12.9330,80.2160),(12.9300,80.2130),
            (12.9290,80.2070),(12.9310,80.2030),(12.9330,80.2060),(12.9360,80.2090),
            (12.9380,80.2120),(12.9400,80.2150),(12.9430,80.2170),(12.9420,80.2210),
            (12.9390,80.2190),(12.9360,80.2150),(12.9344,80.2120)],
    }
    # Stop specs: (start_minute, duration_minutes)
    STOPS = {1: [(62, 42), (320, 38)], 2: [(75, 45), (300, 40)],
             3: [(55, 50), (310, 35)], 4: [(80, 38), (330, 45)]}
    TOTAL_MINUTES = 480

    now = datetime.utcnow()
    rows = []
    for vid in [1, 2, 3, 4]:
        wps = ROUTES[vid]
        stops = STOPS[vid]
        shift_start = now - timedelta(minutes=TOTAL_MINUTES + 30)

        # Build stopped-minute → position map
        stop_pos = {}
        n_wps = len(wps)
        for start_m, dur_m in stops:
            mid_wp = min(n_wps - 1, round(start_m / TOTAL_MINUTES * n_wps))
            slat, slng = wps[mid_wp]
            for m in range(start_m, start_m + dur_m):
                stop_pos[m] = (slat, slng)

        stopped = set(stop_pos.keys())
        moving_minutes = TOTAL_MINUTES - len(stopped)
        segment_len = max(1, moving_minutes / (n_wps - 1))

        cur_lat, cur_lng = wps[0]
        wp_idx = 0
        seg_t = 0.0
        prev_lat, prev_lng = cur_lat, cur_lng

        for minute in range(TOTAL_MINUTES):
            t = shift_start + timedelta(minutes=minute)
            if minute in stopped:
                slat, slng = stop_pos[minute]
                jlat = slat + _rnd.uniform(-0.00005, 0.00005)
                jlng = slng + _rnd.uniform(-0.00005, 0.00005)
                km = _haversine(prev_lat, prev_lng, jlat, jlng)
                rows.append((vid, round(jlat, 6), round(jlng, 6), "patrolling",
                             round(km, 4), t.strftime("%Y-%m-%d %H:%M:%S")))
                prev_lat, prev_lng = jlat, jlng
            else:
                km = _haversine(prev_lat, prev_lng, cur_lat, cur_lng)
                rows.append((vid, round(cur_lat, 6), round(cur_lng, 6), "patrolling",
                             round(km, 4), t.strftime("%Y-%m-%d %H:%M:%S")))
                prev_lat, prev_lng = cur_lat, cur_lng
                if wp_idx < n_wps - 1:
                    seg_t += 1.0 / segment_len
                    if seg_t >= 1.0:
                        seg_t -= 1.0
                        wp_idx = min(wp_idx + 1, n_wps - 2)
                    t2 = max(0.0, min(1.0, seg_t))
                    la1, lo1 = wps[wp_idx]
                    la2, lo2 = wps[wp_idx + 1]
                    cur_lat = la1 + (la2 - la1) * t2
                    cur_lng = lo1 + (lo2 - lo1) * t2

    cursor.executemany(
        "INSERT INTO patrol_telemetry (vehicle_id, lat, lng, status, km_delta, recorded_at) VALUES (?,?,?,?,?,?)",
        rows
    )
    conn.commit()


def _ensure_commissioner_user(conn: sqlite3.Connection):
    """Add missing users (handles existing DBs from before new roles were added).
    NOTE: If the CHECK constraint is too old, delete alerts.db and restart to regenerate.
    """
    from backend.auth import hash_password
    cursor = conn.cursor()

    missing = [
        ("commissioner1", hash_password("comm1pass"), "commissioner", "Commissioner Sanjay Kumar IPS", "9841000003", None),
        ("patrol1", hash_password("patrol1pass"), "patrol", "Const. Ravi Kumar",   "9841000021", 1),
        ("patrol2", hash_password("patrol2pass"), "patrol", "Const. Kavitha Devi", "9841000022", 2),
        ("patrol3", hash_password("patrol3pass"), "patrol", "Const. Arjun Singh",  "9841000023", 3),
        ("patrol4", hash_password("patrol4pass"), "patrol", "Const. Meena Rani",   "9841000024", 4),
    ]
    for (uname, phash, role, full_name, phone, vid) in missing:
        cursor.execute("SELECT id FROM users WHERE username = ?", (uname,))
        if cursor.fetchone() is None:
            try:
                cursor.execute(
                    "INSERT INTO users (username, password_hash, role, full_name, phone, vehicle_id) VALUES (?,?,?,?,?,?)",
                    (uname, phash, role, full_name, phone, vid),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                print(f"WARNING: Could not create {uname} — old schema. Delete alerts.db and restart.")


# ============ User Functions ============

def get_user_by_username(username: str) -> Optional[dict]:
    """Get user by username."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash, role, full_name, phone, vehicle_id, created_at FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id: int) -> Optional[dict]:
    """Get user by ID."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash, role, full_name, phone, vehicle_id, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# ============ Alert Functions ============

def create_alert(citizen_id: int, alert_type: str, description: Optional[str], lat: float, lng: float) -> dict:
    """Create a new alert."""
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO alerts (citizen_id, alert_type, description, lat, lng, status)
           VALUES (?, ?, ?, ?, ?, 'pending')""",
        (citizen_id, alert_type, description, lat, lng)
    )
    conn.commit()
    alert_id = cursor.lastrowid
    conn.close()

    return get_alert_by_id(alert_id)

def get_alert_by_id(alert_id: int) -> Optional[dict]:
    """Get alert by ID, including citizen name from users JOIN."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT alerts.id, alerts.citizen_id, u.full_name AS citizen_name,
               alerts.alert_type, alerts.description, alerts.lat, alerts.lng, alerts.status,
               alerts.dispatched_vehicle_id, alerts.acknowledged_by, alerts.resolved_by,
               alerts.eta_minutes, alerts.report_type, alerts.report_notes,
               alerts.created_at, alerts.updated_at, alerts.resolved_at
        FROM alerts LEFT JOIN users u ON alerts.citizen_id = u.id
        WHERE alerts.id = ?
    """, (alert_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_alerts_for_citizen(citizen_id: int) -> list[dict]:
    """Get all alerts for a citizen, with patrol messages embedded."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT alerts.id, alerts.citizen_id, u.full_name AS citizen_name,
               alerts.alert_type, alerts.description, alerts.lat, alerts.lng, alerts.status,
               alerts.dispatched_vehicle_id, alerts.acknowledged_by, alerts.resolved_by,
               alerts.eta_minutes, alerts.report_type, alerts.report_notes,
               alerts.created_at, alerts.updated_at, alerts.resolved_at
        FROM alerts LEFT JOIN users u ON alerts.citizen_id = u.id
        WHERE alerts.citizen_id = ? ORDER BY alerts.id DESC
    """, (citizen_id,))
    alerts = [dict(row) for row in cursor.fetchall()]

    # Embed patrol messages keyed by alert_id
    if alerts:
        alert_ids = [a["id"] for a in alerts]
        placeholders = ",".join("?" * len(alert_ids))
        msg_rows = conn.execute(
            f"SELECT * FROM alert_messages WHERE alert_id IN ({placeholders}) ORDER BY created_at",
            alert_ids
        ).fetchall()
        msgs_by_alert: dict = {}
        for r in msg_rows:
            msgs_by_alert.setdefault(r["alert_id"], []).append(dict(r))
        for alert in alerts:
            alert["messages"] = msgs_by_alert.get(alert["id"], [])

    conn.close()
    return alerts

def get_all_alerts(limit: int = 100, offset: int = 0, status_filter: Optional[str] = None) -> tuple[list[dict], int]:
    """Get all alerts with optional status filter."""
    conn = get_conn()
    cursor = conn.cursor()

    # Count total
    if status_filter:
        cursor.execute("SELECT COUNT(*) FROM alerts WHERE status = ?", (status_filter,))
    else:
        cursor.execute("SELECT COUNT(*) FROM alerts")
    total = cursor.fetchone()[0]

    # Fetch paginated with citizen name JOIN
    if status_filter:
        cursor.execute("""
            SELECT alerts.id, alerts.citizen_id, u.full_name AS citizen_name,
                   alerts.alert_type, alerts.description, alerts.lat, alerts.lng, alerts.status,
                   alerts.dispatched_vehicle_id, alerts.acknowledged_by, alerts.resolved_by,
                   alerts.eta_minutes, alerts.report_type, alerts.report_notes,
                   alerts.created_at, alerts.updated_at, alerts.resolved_at
            FROM alerts LEFT JOIN users u ON alerts.citizen_id = u.id
            WHERE alerts.status = ? ORDER BY alerts.created_at DESC LIMIT ? OFFSET ?
        """, (status_filter, limit, offset))
    else:
        cursor.execute("""
            SELECT alerts.id, alerts.citizen_id, u.full_name AS citizen_name,
                   alerts.alert_type, alerts.description, alerts.lat, alerts.lng, alerts.status,
                   alerts.dispatched_vehicle_id, alerts.acknowledged_by, alerts.resolved_by,
                   alerts.eta_minutes, alerts.report_type, alerts.report_notes,
                   alerts.created_at, alerts.updated_at, alerts.resolved_at
            FROM alerts LEFT JOIN users u ON alerts.citizen_id = u.id
            ORDER BY alerts.created_at DESC LIMIT ? OFFSET ?
        """, (limit, offset))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows], total

def update_alert_status(
    alert_id: int,
    status: str,
    officer_id: Optional[int] = None,
    vehicle_id: Optional[int] = None,
    eta_minutes: Optional[int] = None,
    resolved_at: Optional[str] = None
) -> Optional[dict]:
    """Update alert status and metadata."""
    conn = get_conn()
    cursor = conn.cursor()

    updates = [f"status = ?"]
    params = [status]

    if officer_id is not None:
        updates.append("acknowledged_by = ?")
        params.append(officer_id)

    if vehicle_id is not None:
        updates.append("dispatched_vehicle_id = ?")
        params.append(vehicle_id)

    if eta_minutes is not None:
        updates.append("eta_minutes = ?")
        params.append(eta_minutes)

    if resolved_at is not None:
        updates.append("resolved_at = ?")
        params.append(resolved_at)

    params.append(alert_id)

    query = f"UPDATE alerts SET {', '.join(updates)} WHERE id = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()

    return get_alert_by_id(alert_id)


def update_alert_report(alert_id: int, report_type: str, report_notes: str) -> Optional[dict]:
    """File a DSR or CSR report, auto-resolving the alert."""
    conn = get_conn()
    conn.execute(
        "UPDATE alerts SET report_type=?, report_notes=?, status='resolved', "
        "resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
        (report_type, report_notes, alert_id),
    )
    conn.commit()
    conn.close()
    return get_alert_by_id(alert_id)

# ============ Alert Messages ============

def create_alert_message(alert_id: int, sender_id: int, sender_role: str, body: str) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO alert_messages (alert_id, sender_id, sender_role, body) VALUES (?,?,?,?)",
        (alert_id, sender_id, sender_role, body),
    )
    conn.commit()
    msg_id = cursor.lastrowid
    cursor.execute("SELECT * FROM alert_messages WHERE id = ?", (msg_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)


def get_messages_for_alert(alert_id: int) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM alert_messages WHERE alert_id = ? ORDER BY created_at",
        (alert_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_live_alert_summary() -> dict:
    """Return today's live alert KPIs for the Commissioner summary endpoint."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
          COUNT(*)                                                                      AS total,
          SUM(CASE WHEN status='resolved' AND date(resolved_at)=date('now') THEN 1 ELSE 0 END) AS resolved_today,
          SUM(CASE WHEN status='pending'    THEN 1 ELSE 0 END)                          AS pending,
          SUM(CASE WHEN status IN ('dispatched','on_scene') THEN 1 ELSE 0 END)           AS dispatched,
          AVG(CASE WHEN eta_minutes IS NOT NULL THEN eta_minutes END)                   AS avg_eta
        FROM alerts
        WHERE date(created_at) = date('now')
    """)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {"total": 0, "resolved_today": 0, "pending": 0, "dispatched": 0, "avg_eta": None}


# ============ Location Tracking ============

def upsert_alert_location(alert_id: int, lat: float, lng: float) -> None:
    """Append a new location record for an alert."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO alert_locations (alert_id, lat, lng) VALUES (?, ?, ?)",
        (alert_id, lat, lng)
    )
    conn.commit()
    conn.close()

def get_latest_location(alert_id: int) -> Optional[dict]:
    """Get the most recent location for an alert."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, alert_id, lat, lng, recorded_at FROM alert_locations
        WHERE alert_id = ? ORDER BY recorded_at DESC LIMIT 1
    """, (alert_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


# ============ Patrol Telemetry ============

def log_patrol_position(vehicle_id: int, lat: float, lng: float, status: str, km_delta: float = 0.0) -> None:
    conn = get_conn()
    conn.execute(
        "INSERT INTO patrol_telemetry (vehicle_id, lat, lng, status, km_delta) VALUES (?,?,?,?,?)",
        (vehicle_id, lat, lng, status, km_delta),
    )
    conn.commit()
    conn.close()


def get_last_telemetry(vehicle_id: int) -> Optional[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, vehicle_id, lat, lng, status, km_delta, recorded_at FROM patrol_telemetry "
        "WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 1",
        (vehicle_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_patrol_telemetry(vehicle_id: int, since_minutes: int = 480) -> list[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, vehicle_id, lat, lng, status, km_delta, recorded_at FROM patrol_telemetry "
        "WHERE vehicle_id = ? AND recorded_at >= datetime('now', ? || ' minutes') "
        "ORDER BY recorded_at ASC",
        (vehicle_id, f"-{since_minutes}"),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_patrol_tracks_today() -> dict:
    """Return today's telemetry for all 4 patrol vehicles, keyed by vehicle_id."""
    conn = get_conn()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    rows = conn.execute(
        "SELECT vehicle_id, lat, lng, status, recorded_at FROM patrol_telemetry "
        "WHERE DATE(recorded_at) = ? ORDER BY vehicle_id, recorded_at ASC",
        (today,)
    ).fetchall()
    conn.close()
    result: dict = {}
    for r in rows:
        result.setdefault(r["vehicle_id"], []).append(dict(r))
    return result


def get_stationary_alerts(threshold_minutes: int = 120) -> list[dict]:
    """Return vehicles whose last telemetry point is older than threshold_minutes."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT vehicle_id, lat, lng, status, recorded_at,
               CAST((julianday('now') - julianday(recorded_at)) * 24 * 60 AS INTEGER) AS stationary_minutes
        FROM patrol_telemetry
        WHERE id IN (SELECT MAX(id) FROM patrol_telemetry GROUP BY vehicle_id)
          AND status = 'patrolling'
          AND stationary_minutes >= ?
        """,
        (threshold_minutes,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_shift_km(vehicle_id: int, date_str: str) -> float:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COALESCE(SUM(km_delta), 0) FROM patrol_telemetry "
        "WHERE vehicle_id = ? AND DATE(recorded_at) = ?",
        (vehicle_id, date_str),
    )
    result = cursor.fetchone()[0]
    conn.close()
    return float(result)


# ============ Incident Reports (DSR/CSR/FIR) ============

def create_incident_report(
    report_type: str,
    crime_head: str,
    description: Optional[str],
    place: Optional[str],
    lat: Optional[float],
    lng: Optional[float],
    created_by: int,
    alert_id: Optional[int] = None,
) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO incident_reports
           (report_type, crime_head, description, place, lat, lng, created_by, alert_id)
           VALUES (?,?,?,?,?,?,?,?)""",
        (report_type, crime_head, description, place, lat, lng, created_by, alert_id),
    )
    conn.commit()
    report_id = cursor.lastrowid
    conn.close()
    return get_incident_report(report_id)


def get_incident_report(report_id: int) -> Optional[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, report_type, crime_head, description, place, lat, lng, status, "
        "escalated_to, alert_id, created_by, reviewed_by, created_at, updated_at "
        "FROM incident_reports WHERE id = ?",
        (report_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_reports(
    report_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    where_clauses = []
    params: list = []
    if report_type:
        where_clauses.append("report_type = ?")
        params.append(report_type)
    if status_filter:
        where_clauses.append("status = ?")
        params.append(status_filter)
    where = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    params.append(limit)
    cursor.execute(
        f"SELECT id, report_type, crime_head, description, place, lat, lng, status, "
        f"escalated_to, alert_id, created_by, reviewed_by, created_at, updated_at "
        f"FROM incident_reports {where} ORDER BY created_at DESC LIMIT ?",
        params,
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def escalate_report(report_id: int, escalated_to: str, reviewed_by: int) -> Optional[dict]:
    conn = get_conn()
    conn.execute(
        "UPDATE incident_reports SET status='escalated', escalated_to=?, reviewed_by=? WHERE id=?",
        (escalated_to, reviewed_by, report_id),
    )
    conn.commit()
    conn.close()
    return get_incident_report(report_id)


# ============ Friend of Police ============

def register_fop(user_id: int, area: Optional[str]) -> dict:
    conn = get_conn()
    cursor = conn.cursor()
    # Upsert: one registration per user
    cursor.execute(
        "INSERT OR IGNORE INTO fop_volunteers (user_id, area) VALUES (?,?)",
        (user_id, area),
    )
    conn.commit()
    cursor.execute(
        "SELECT id, user_id, area, verified, verified_by, created_at FROM fop_volunteers WHERE user_id=?",
        (user_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row)


def get_fop_volunteers() -> list[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT f.id, f.user_id, u.full_name, f.area, f.verified, f.verified_by, f.created_at
           FROM fop_volunteers f JOIN users u ON u.id = f.user_id
           ORDER BY f.created_at DESC"""
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def verify_fop(fop_id: int, verified_by: int) -> Optional[dict]:
    conn = get_conn()
    conn.execute(
        "UPDATE fop_volunteers SET verified=1, verified_by=? WHERE id=?",
        (verified_by, fop_id),
    )
    conn.commit()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT f.id, f.user_id, u.full_name, f.area, f.verified, f.verified_by, f.created_at "
        "FROM fop_volunteers f JOIN users u ON u.id = f.user_id WHERE f.id=?",
        (fop_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_fop_by_user(user_id: int) -> Optional[dict]:
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, user_id, area, verified, verified_by, created_at FROM fop_volunteers WHERE user_id=?",
        (user_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
