import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plane,
  Users,
  UserPlus,
  ListOrdered,
  Gift,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  AlertTriangle,
  Trash2,
  ClipboardList,
  Lock,
  Unlock,
  ShieldCheck,
  History as HistoryIcon,
} from "lucide-react";

/* ---------------------------------------------------------------
   CX VIRTUAL — SENIORITY & CLASS DEFINITIONS
   Order below IS the seniority ladder (index 0 = most senior).
---------------------------------------------------------------- */
const RANKS = [
  { band: "CX", title: "Chairman" },
  { band: "CX", title: "Vice Chairman" },
  { band: "CX", title: "Chief Executive Officer" },
  { band: "CX", title: "Chief Operations Officer" },
  { band: "CX", title: "Chief Customer Officer" },
  { band: "EX", title: "Board Of Directors" },
  { band: "HR", title: "Chief Pilot" },
  { band: "HR", title: "General Manager" },
  { band: "HR", title: "Operations Manager" },
  { band: "HR", title: "Head of Development" },
  { band: "MR", title: "Developer" },
  { band: "MR", title: "Event Manager" },
  { band: "MR", title: "Senior Personnel" },
  { band: "LR", title: "Flight Crew" },
  { band: "LR", title: "Cabin Crew" },
  { band: "LR", title: "Ground Crew" },
  { band: "LR", title: "Public Relations" },
  { band: "LR", title: "Trainee" },
].map((r, i) => ({ ...r, idx: i }));

const BAND_COLOR = {
  CX: "#00645A", // Cathay Jade
  EX: "#4A6670", // Cathay steel
  HR: "#1E9E8C", // teal
  MR: "#B08D57", // premium sand/gold
  LR: "#7A8286", // Cathay grey
};

const CLASSES = [
  { id: "EC", label: "Economy" },
  { id: "PE", label: "Premium Economy" },
  { id: "BC", label: "Business" },
  { id: "FC", label: "First" },
];
const classIdx = (id) => CLASSES.findIndex((c) => c.id === id);
const isTrainee = (rankIdx) => RANKS[rankIdx]?.title === "Trainee";

function eligibleDesiredClasses(currentClassId, rankIdx) {
  const c = classIdx(currentClassId);
  if (c < 0 || c >= CLASSES.length - 1) return [];
  if (isTrainee(rankIdx)) return [CLASSES[c + 1]];
  return CLASSES.slice(c + 1);
}

// week key is the date (YYYY-MM-DD) of that week's Sunday, computed against
// Hong Kong's calendar date — not the viewer's local timezone — so the guest
// privilege limit resets at Sunday 00:00 HKT for everyone, everywhere.
function weekKeyHKT(t = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  const asUTC = new Date(Date.UTC(y, m - 1, d));
  asUTC.setUTCDate(asUTC.getUTCDate() - asUTC.getUTCDay()); // back up to that week's Sunday
  return asUTC.toISOString().slice(0, 10);
}

const uid = () => Math.random().toString(36).slice(2, 10);

// each flight gets its own gate password, separate from the admin (roster/log) password
function genGatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid mix-ups
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// matches a rank cell like "Chief Pilot" or "HR | Chief Pilot" to a RANKS index
function matchRank(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("|")) {
    const title = t.split("|").slice(1).join("|").trim();
    const hit = RANKS.find((r) => r.title.toLowerCase() === title);
    if (hit) return hit.idx;
  }
  const exact = RANKS.find((r) => r.title.toLowerCase() === t);
  if (exact) return exact.idx;
  const loose = [...RANKS].sort((a, b) => b.title.length - a.title.length).find((r) => t.includes(r.title.toLowerCase()));
  return loose ? loose.idx : null;
}

// one staff member per line, "Name<tab or comma>Rank" — matches a paste straight out of a spreadsheet
function parseRosterPaste(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const unmatched = [];
  lines.forEach((line) => {
    if (/^name\b/i.test(line) && /rank/i.test(line)) return; // skip an obvious header row
    const idx = line.search(/\t|,/);
    let name, rankText;
    if (idx === -1) {
      name = line;
      rankText = "";
    } else {
      name = line.slice(0, idx).trim();
      rankText = line.slice(idx + 1).replace(/^[,\t]+/, "").trim();
    }
    if (!name) return;
    const rankIdx = matchRank(rankText);
    if (rankIdx === null) unmatched.push({ name, rankText });
    else rows.push({ name, rankIdx });
  });
  return { rows, unmatched };
}

// flights use <input type="datetime-local"> so every flight's "when" is the
// same "YYYY-MM-DDTHH:mm" format — no free typing, no inconsistent formats.
function fmtFlightWhen(when) {
  if (!when) return null;
  const d = new Date(when);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// earliest flight first, latest last; flights with no time set sink to the bottom
function sortFlightsByWhen(flights) {
  return [...flights].sort((a, b) => {
    const ta = a.when ? new Date(a.when).getTime() : Infinity;
    const tb = b.when ? new Date(b.when).getTime() : Infinity;
    return ta - tb;
  });
}
const fmtTime = (t) =>
  new Date(t).toLocaleString("en-GB", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }) + " HKT";

/* ---------------------------------------------------------------
   STORAGE HELPERS (shared — every staff member sees the same board)
---------------------------------------------------------------- */
const SUPABASE_URL = "https://jbhvbpbomywhwxnaimvj.supabase.co";
const SUPABASE_KEY = "sb_publishable__m83yZea3Oyt_B92--pcsA_jt5nwjDq";

async function loadShared(key, fallback) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/board_state?id=eq.${encodeURIComponent(key)}&select=value`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!res.ok) return fallback;

    const rows = await res.json();
    return rows.length ? rows[0].value : fallback;
  } catch {
    return fallback;
  }
}

async function saveShared(key, value) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/board_state?id=eq.${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          value,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}
const KEY_ROSTER = "cxv-standby-roster";
const KEY_FLIGHTS = "cxv-standby-flights";
const KEY_GUESTLOG = "cxv-standby-guestlog";
const ROSTER_PASSWORD = "cxstaff";

/* ---------------------------------------------------------------
   SHARED UI ATOMS
---------------------------------------------------------------- */
function RankBadge({ rankIdx, size = "sm" }) {
  const r = RANKS[rankIdx];
  if (!r) return null;
  const pad = size === "sm" ? "2px 8px" : "3px 10px";
  const fs = size === "sm" ? 11 : 12;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        borderRadius: 4,
        fontSize: fs,
        fontFamily: "var(--font-mono)",
        letterSpacing: 0.4,
        color: BAND_COLOR[r.band],
        border: `1px solid ${BAND_COLOR[r.band]}55`,
        background: `${BAND_COLOR[r.band]}14`,
        whiteSpace: "nowrap",
      }}
    >
      {r.band} · {r.title}
    </span>
  );
}

function ClassPill({ id }) {
  const c = CLASSES.find((x) => x.id === id);
  if (!c) return null;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "2px 7px",
        borderRadius: 4,
        border: "1px solid var(--line)",
        color: "var(--text-dim)",
      }}
    >
      {c.id}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    waiting: { color: "var(--jade)", label: "waiting" },
    assigned: { color: "var(--green)", label: "seated" },
    denied: { color: "var(--red)", label: "denied" },
  };
  const s = map[status] || map.waiting;
  return (
    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: s.color }}>
      {s.label}
    </span>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "default", disabled, style, type = "button" }) {
  const variants = {
    default: { background: "var(--jade)", color: "#FFFFFF", border: "1px solid var(--jade)" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)" },
    danger: { background: "transparent", color: "var(--red)", border: "1px solid #E7001355" },
    good: { background: "var(--green)", color: "#FFFFFF", border: "1px solid var(--green)" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        padding: "7px 12px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "filter .15s",
        ...style,
      }}
      onMouseOver={(e) => !disabled && (e.currentTarget.style.filter = "brightness(1.12)")}
      onMouseOut={(e) => (e.currentTarget.style.filter = "none")}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--text-dim)" }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  color: "var(--text)",
  padding: "7px 9px",
  fontSize: 13,
  outline: "none",
};

// type-to-filter, click-to-select staff name field — used everywhere someone
// needs to identify themselves against the roster instead of a plain <select>.
function StaffPicker({ roster, value, onChange, placeholder = "Type a name…", width = 220 }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = roster.find((s) => s.id === value) || null;

  useEffect(() => {
    setQuery(selected ? selected.name : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const q = query.trim().toLowerCase();
  const matches = (q ? roster.filter((s) => s.name.toLowerCase().includes(q)) : roster)
    .slice()
    .sort((a, b) => a.rankIdx - b.rankIdx)
    .slice(0, 8);

  return (
    <div style={{ position: "relative", width }}>
      <input
        style={{ ...inputStyle, width: "100%" }}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(""); // typing again clears a previous selection
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            marginTop: 4,
            maxHeight: 210,
            overflowY: "auto",
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
          }}
        >
          {matches.map((s) => (
            <div
              key={s.id}
              onMouseDown={() => {
                onChange(s.id);
                setQuery(s.name);
                setOpen(false);
              }}
              style={{
                padding: "7px 9px",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--panel2)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span>{s.name}</span>
              <RankBadge rankIdx={s.rankIdx} />
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 30,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            marginTop: 4,
            padding: "7px 9px",
            fontSize: 12,
            color: "var(--text-dim)",
          }}
        >
          No match.
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
---------------------------------------------------------------- */
export default function App() {
  const [tab, setTab] = useState("offduty");
  const [roster, setRoster] = useState(null);
  const [flights, setFlights] = useState(null);
  const [guestLog, setGuestLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onDutyFlightId, setOnDutyFlightId] = useState(null);
  const [offDutyFlightId, setOffDutyFlightId] = useState("");
  const [rosterUnlocked, setRosterUnlocked] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [r, f, g] = await Promise.all([
      loadShared(KEY_ROSTER, []),
      loadShared(KEY_FLIGHTS, []),
      loadShared(KEY_GUESTLOG, []),
    ]);
    setRoster(r);
    setFlights(f);
    setGuestLog(g);
    setLoading(false);
    return r;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const persistRoster = async (next) => {
    setRoster(next);
    await saveShared(KEY_ROSTER, next);
  };
  const persistFlights = async (next) => {
    setFlights(next);
    await saveShared(KEY_FLIGHTS, next);
  };
  const persistGuestLog = async (next) => {
    setGuestLog(next);
    await saveShared(KEY_GUESTLOG, next);
  };

  const rosterById = useMemo(() => {
    const m = new Map();
    (roster || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [roster]);

  const onDutyFlight = (flights || []).find((f) => f.id === onDutyFlightId) || null;
  const offDutyFlight = (flights || []).find((f) => f.id === offDutyFlightId) || null;

  const TABS = [
    { id: "offduty", label: "Off Duty", icon: Clock },
    { id: "onduty", label: "On Duty", icon: Plane },
    { id: "roster", label: "Staff Roster", icon: Users },
    { id: "guests", label: "Guest Privileges", icon: Gift },
    { id: "log", label: "Log", icon: HistoryIcon },
  ];

  const updateFlight = (nextFlight) =>
    persistFlights(flights.map((f) => (f.id === nextFlight.id ? nextFlight : f)));

  // wipes every seated/denied record (keeps flights + anyone still waiting).
  // guest privilege usage isn't touched here — it already resets itself week to week.
  const clearLog = () => {
    persistFlights(flights.map((f) => ({ ...f, standby: f.standby.filter((s) => s.status === "waiting") })));
  };

  return (
    <div
      style={{
        "--bg": "#F4F5F5",
        "--panel": "#FFFFFF",
        "--panel2": "#EEF4F3",
        "--line": "#DCE0E0",
        "--text": "#1A1A1A",
        "--text-dim": "#6E7476",
        "--jade": "#00645A",
        "--green": "#0E8A72",
        "--red": "#E70013",
        "--font-mono": "'IBM Plex Mono', ui-monospace, monospace",
        "--font-sans": "'Inter', ui-sans-serif, system-ui",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        minHeight: "100vh",
        width: "100%",
        overflowX: "hidden",
        padding: 18,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        html, body, #root, #app {
          background: #F4F5F5;
          min-height: 100%;
          margin: 0;
        }
        * { box-sizing: border-box; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #C7CBCB; border-radius: 8px; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "var(--jade)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plane size={18} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>CX Virtual — Standby Board</div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              seniority upgrade queue · live for all staff
            </div>
          </div>
        </div>
        <Btn variant="ghost" onClick={refresh}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={13} /> Sync
          </span>
        </Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--line)" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--jade)" : "2px solid transparent",
                color: active ? "var(--text)" : "var(--text-dim)",
                padding: "9px 4px",
                marginRight: 18,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading || !roster || !flights || !guestLog ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13, padding: 30, textAlign: "center" }}>Loading board…</div>
      ) : tab === "roster" ? (
        <RosterTab
          roster={roster}
          setRoster={persistRoster}
          unlocked={rosterUnlocked}
          setUnlocked={setRosterUnlocked}
        />
      ) : tab === "guests" ? (
        <GuestTab roster={roster} guestLog={guestLog} flights={flights} />
      ) : tab === "log" ? (
        <LogTab flights={flights} onClearLog={clearLog} />
      ) : tab === "onduty" ? (
        onDutyFlight ? (
          <OnDutyFlightPanel flight={onDutyFlight} roster={roster} onUpdate={updateFlight} onBack={() => setOnDutyFlightId(null)} />
        ) : (
          <OnDutyBoard flights={flights} setFlights={persistFlights} onOpen={setOnDutyFlightId} />
        )
      ) : tab === "offduty" ? (
        <OffDutyTab
          flights={flights}
          roster={roster}
          rosterById={rosterById}
          guestLog={guestLog}
          setGuestLog={persistGuestLog}
          onUpdateFlight={updateFlight}
          flightId={offDutyFlightId}
          setFlightId={setOffDutyFlightId}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------
   ON DUTY — board (create/manage flights)
---------------------------------------------------------------- */
function OnDutyBoard({ flights, setFlights, onOpen }) {
  const [num, setNum] = useState("");
  const [route, setRoute] = useState("");
  const [when, setWhen] = useState("");
  const [showPwModal, setShowPwModal] = useState(false);
  const [createdNum, setCreatedNum] = useState("");
  const [createdPw, setCreatedPw] = useState("");

  const addFlight = () => {
    if (!num.trim()) return;
    const gatePassword = genGatePassword();
    const f = {
      id: uid(),
      flightNumber: num.trim().toUpperCase(),
      route: route.trim(),
      when: when.trim(),
      seats: { FC: 0, BC: 0, PE: 0 },
      standby: [],
      gatePassword,
      createdAt: Date.now(),
    };
    setFlights([f, ...flights]);
    setCreatedNum(f.flightNumber);
    setCreatedPw(gatePassword);
    setShowPwModal(true);
    setNum("");
    setRoute("");
    setWhen("");
  };

  const removeFlight = (id) => setFlights(flights.filter((f) => f.id !== id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showPwModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowPwModal(false)}
        >
          <Panel
            style={{ padding: 22, maxWidth: 320, width: "100%" }}
            // eslint-disable-next-line react/no-unknown-property
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                <ShieldCheck size={15} color="var(--jade)" /> {createdNum} is on the board
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4, marginBottom: 10 }}>
                Gate agents need this password to accept or deny standby requests on this flight — share it with
                whoever's working the gate. It's unique to this flight, separate from the roster/log admin password.
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: "var(--jade)",
                  background: "var(--panel2)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  textAlign: "center",
                }}
              >
                {createdPw}
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <Btn onClick={() => setShowPwModal(false)}>Got it</Btn>
              </div>
            </div>
          </Panel>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
        For flight attendants (set open seats) and gate agents (accept or deny standby requests).
      </div>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Open a flight on the board</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Flight number">
            <input style={{ ...inputStyle, width: 120 }} placeholder="CX901" value={num} onChange={(e) => setNum(e.target.value)} />
          </Field>
          <Field label="Route">
            <input style={{ ...inputStyle, width: 160 }} placeholder="VHHH – VTBS" value={route} onChange={(e) => setRoute(e.target.value)} />
          </Field>
          <Field label="Date / time">
            <input type="datetime-local" style={{ ...inputStyle, width: 190 }} value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Btn onClick={addFlight}>+ Add to board</Btn>
        </div>
      </Panel>

      {flights.length === 0 ? (
        <Panel style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          No flights on the board yet. Add one above to start a standby queue.
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sortFlightsByWhen(flights).map((f) => {
            const waiting = f.standby.filter((s) => s.status === "waiting" && !s.isGuest).length;
            const guestsWaiting = f.standby.filter((s) => s.status === "waiting" && s.isGuest).length;
            return (
              <Panel
                key={f.id}
                style={{
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div onClick={() => onOpen(f.id)} style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 220, cursor: "pointer" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: "var(--jade)", minWidth: 78 }}>
                    {f.flightNumber}
                  </div>
                  <div>
                    <div style={{ fontSize: 13 }}>{f.route || "route not set"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{fmtFlightWhen(f.when) || "time not set"}</div>
                  </div>
                </div>
                <div onClick={() => onOpen(f.id)} style={{ display: "flex", gap: 14, fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer" }}>
                  {CLASSES.filter((c) => c.id !== "EC").map((c) => (
                    <div key={c.id} style={{ textAlign: "center", color: f.seats[c.id] > 0 ? "var(--green)" : "var(--text-dim)" }}>
                      <div>{c.id}</div>
                      <div style={{ fontWeight: 700 }}>{f.seats[c.id]}</div>
                    </div>
                  ))}
                </div>
                <div onClick={() => onOpen(f.id)} style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 10, cursor: "pointer" }}>
                  {waiting > 0 && <span>{waiting} staff waiting</span>}
                  {guestsWaiting > 0 && <span>{guestsWaiting} guest req.</span>}
                  {waiting === 0 && guestsWaiting === 0 && <span>queue empty</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Btn variant="ghost" onClick={() => onOpen(f.id)}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Manage <ChevronRight size={13} />
                    </span>
                  </Btn>
                  <button
                    onClick={() => removeFlight(f.id)}
                    title="Remove flight"
                    style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   ON DUTY — manage a single flight (FA seats + GA accept/deny)
---------------------------------------------------------------- */
function OnDutyFlightPanel({ flight, roster, onUpdate, onBack }) {
  const [seatsDraft, setSeatsDraft] = useState(flight.seats);
  const [faId, setFaId] = useState("");
  const [processorId, setProcessorId] = useState("");
  const [gatePw, setGatePw] = useState("");
  useEffect(() => setSeatsDraft(flight.seats), [flight.id]);

  // flights created before this feature won't have their own password yet — give them one
  useEffect(() => {
    if (!flight.gatePassword) onUpdate({ ...flight, gatePassword: genGatePassword() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id]);

  const fa = roster.find((s) => s.id === faId) || null;
  const processor = roster.find((s) => s.id === processorId) || null;
  const gateUnlocked = !!flight.gatePassword && gatePw === flight.gatePassword;

  const saveSeats = () => {
    if (!fa) return;
    onUpdate({
      ...flight,
      seats: seatsDraft,
      seatsUpdatedBy: { id: fa.id, name: fa.name, rankIdx: fa.rankIdx },
      seatsUpdatedAt: Date.now(),
    });
  };

  const sortedQueue = (list) => [...list].sort((a, b) => (b.allocatedPriority ? 1 : 0) - (a.allocatedPriority ? 1 : 0) || a.rankIdx - b.rankIdx || a.requestedAt - b.requestedAt);
  const standbyQueue = sortedQueue(flight.standby.filter((s) => !s.isGuest && s.status === "waiting"));
  const guestQueue = sortedQueue(flight.standby.filter((s) => s.isGuest && s.status === "waiting"));
  const history = flight.standby.filter((s) => s.status !== "waiting");

  const seatEntry = (entryId, action, assignClass) => {
    if (!processor || !gateUnlocked) return;
    const entry = flight.standby.find((s) => s.id === entryId);
    if (!entry) return;
    const targetClass = assignClass || entry.desiredClass;
    let seats = flight.seats;
    if (action === "assign") {
      if (seats[targetClass] <= 0) return;
      seats = { ...seats, [targetClass]: seats[targetClass] - 1 };
    }
    const nextStandby = flight.standby.map((s) => {
      if (s.id !== entryId) return s;
      const reassigned = action === "assign" && targetClass !== entry.desiredClass;
      return {
        ...s,
        status: action === "assign" ? "assigned" : "denied",
        desiredClass: action === "assign" ? targetClass : s.desiredClass,
        requestedClass: reassigned ? entry.desiredClass : s.requestedClass,
        processedBy: { id: processor.id, name: processor.name, rankIdx: processor.rankIdx },
        processedAt: Date.now(),
      };
    });
    onUpdate({ ...flight, seats, standby: nextStandby });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 8 }}
        >
          ← Back to on-duty board
        </button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--jade)" }}>{flight.flightNumber}</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{flight.route || "route not set"} · {fmtFlightWhen(flight.when) || "time not set"}</div>
        </div>
      </div>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={14} /> Flight attendant — open premium seats
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
          Enter how many seats are open once boarding has closed for FC/BC.
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="You are entering as">
            <StaffPicker roster={roster} value={faId} onChange={setFaId} placeholder="Type your name…" width={200} />
          </Field>
          {CLASSES.filter((c) => c.id !== "EC").map((c) => (
            <Field key={c.id} label={`${c.label} (${c.id})`}>
              <input
                type="number"
                min={0}
                style={{ ...inputStyle, width: 90 }}
                value={seatsDraft[c.id]}
                onChange={(e) => setSeatsDraft({ ...seatsDraft, [c.id]: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
          ))}
          <Btn onClick={saveSeats} disabled={!fa}>
            Update seats
          </Btn>
        </div>
        {!fa && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--jade)", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={12} /> Type and select your name to enable Update seats.
          </div>
        )}
        {flight.seatsUpdatedBy && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
            last updated by <span style={{ color: "var(--text)" }}>{flight.seatsUpdatedBy.name}</span>
            <RankBadge rankIdx={flight.seatsUpdatedBy.rankIdx} />· {fmtTime(flight.seatsUpdatedAt)}
          </div>
        )}
      </Panel>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Gate agent — accept or deny requests</div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
          Identify yourself and enter the flight password before processing — every Seat/Deny is logged against your name.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="You are processing as">
            <StaffPicker roster={roster} value={processorId} onChange={setProcessorId} placeholder="Type your name…" width={220} />
          </Field>
          <Field label="Password">
            <input
              type="password"
              style={{ ...inputStyle, width: 140 }}
              value={gatePw}
              onChange={(e) => setGatePw(e.target.value)}
              placeholder="Password"
            />
          </Field>
        </div>
        {!processor && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--jade)", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={12} /> Type and select your name to enable Seat / Deny.
          </div>
        )}
        {processor && !gateUnlocked && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--red)", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={12} /> Enter this flight's password (shown to the host when it was created) to enable Seat / Deny.
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <QueueList
          title="Standby queue — by seniority"
          icon={ListOrdered}
          entries={standbyQueue}
          seats={flight.seats}
          onAssign={seatEntry}
          actionsDisabled={!processor || !gateUnlocked}
        />
        <QueueList
          title="Guest requests — by seniority"
          icon={Gift}
          entries={guestQueue}
          seats={flight.seats}
          onAssign={seatEntry}
          guestMode
          actionsDisabled={!processor || !gateUnlocked}
        />
      </div>

      {history.length > 0 && (
        <Panel style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history
              .sort((a, b) => b.requestedAt - a.requestedAt)
              .map((h) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
                  {h.status === "assigned" ? <CheckCircle2 size={13} color="var(--green)" /> : <XCircle size={13} color="var(--red)" />}
                  <span style={{ color: "var(--text)" }}>{h.name}</span>
                  {h.allocatedPriority && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "var(--jade)", padding: "1px 6px", borderRadius: 4 }}>
                      PRIORITY
                    </span>
                  )}
                  {h.isGuest ? `guest request for ${h.guestName || "unnamed guest"}` : "upgrade request"}
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--jade)" }}>{flight.flightNumber}</span>
                  {!h.isGuest && <ClassPill id={h.currentClass} />}
                  {!h.isGuest && <ChevronRight size={12} />}
                  <ClassPill id={h.desiredClass} />
                  {h.requestedClass && (
                    <span style={{ fontSize: 10.5, color: "var(--jade)" }}>(requested {h.requestedClass})</span>
                  )}
                  <StatusPill status={h.status} />
                  {h.processedBy && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      by <span style={{ color: "var(--text)" }}>{h.processedBy.name}</span>
                      <RankBadge rankIdx={h.processedBy.rankIdx} />
                    </span>
                  )}
                  {h.processedAt && <span style={{ marginLeft: "auto" }}>{fmtTime(h.processedAt)}</span>}
                </div>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function QueueList({ title, icon: Icon, entries, seats, onAssign, guestMode, readOnly, actionsDisabled }) {
  return (
    <Panel style={{ padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
        <Icon size={14} /> {title}
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No one waiting.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e, i) => (
            <QueueRow
              key={e.id}
              e={e}
              i={i}
              seats={seats}
              onAssign={onAssign}
              guestMode={guestMode}
              readOnly={readOnly}
              actionsDisabled={actionsDisabled}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function QueueRow({ e, i, seats, onAssign, guestMode, readOnly, actionsDisabled }) {
  // staff (non-guest) requests can be reassigned to any class the requester is
  // eligible for — useful when the class they asked for is full but another isn't.
  const eligible = !guestMode ? eligibleDesiredClasses(e.currentClass, e.rankIdx) : [];
  const [targetClass, setTargetClass] = useState(e.desiredClass);
  const reassignable = !guestMode && !readOnly && eligible.length > 1;
  const seatOpen = seats[targetClass] > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 8,
        borderRadius: 7,
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)", width: 16 }}>{i + 1}</div>
      <div style={{ flex: 1, minWidth: 100, fontSize: 13 }}>
        {e.name}
        {guestMode && e.guestName && <span style={{ color: "var(--text-dim)" }}> — guest: {e.guestName}</span>}
      </div>
      {e.allocatedPriority && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: "#FFFFFF",
            background: "var(--jade)",
            padding: "2px 7px",
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          PRIORITY
        </span>
      )}
      <RankBadge rankIdx={e.rankIdx} />
      {!guestMode && <ClassPill id={e.currentClass} />}
      <ChevronRight size={12} color="var(--text-dim)" />

      {reassignable ? (
        <select
          value={targetClass}
          onChange={(ev) => setTargetClass(ev.target.value)}
          style={{
            ...inputStyle,
            padding: "2px 6px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            width: "auto",
          }}
        >
          {eligible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} ({seats[c.id]} open)
            </option>
          ))}
        </select>
      ) : (
        <ClassPill id={e.desiredClass} />
      )}

      {reassignable && targetClass !== e.desiredClass && (
        <span style={{ fontSize: 10.5, color: "var(--jade)" }}>reassigning from {e.desiredClass}</span>
      )}

      <div style={{ fontSize: 10.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 3 }}>
        <Clock size={10} /> {fmtTime(e.requestedAt)}
      </div>
      {readOnly ? (
        <div style={{ marginLeft: "auto" }}>
          <StatusPill status={e.status} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <Btn variant="good" disabled={!seatOpen || actionsDisabled} onClick={() => onAssign(e.id, "assign", targetClass)}>
            Seat
          </Btn>
          <Btn variant="danger" disabled={actionsDisabled} onClick={() => onAssign(e.id, "deny")}>
            Deny
          </Btn>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   OFF DUTY — pick flight + name, join the queue
---------------------------------------------------------------- */
function OffDutyTab({ flights, roster, rosterById, guestLog, setGuestLog, onUpdateFlight, flightId, setFlightId }) {
  const sorted = sortFlightsByWhen(flights);

  useEffect(() => {
    if (!flightId && sorted.length) setFlightId(sorted[0].id);
    if (flightId && !sorted.some((f) => f.id === flightId)) setFlightId(sorted[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights]);

  const flight = flights.find((f) => f.id === flightId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
        Pick your flight, pick your name, and request an upgrade or a Business Class guest seat.
      </div>

      <Panel style={{ padding: 14 }}>
        <Field label="Flight">
          <select style={{ ...inputStyle, width: 280 }} value={flightId} onChange={(e) => setFlightId(e.target.value)}>
            {sorted.length === 0 && <option value="">No flights open yet</option>}
            {sorted.map((f) => (
              <option key={f.id} value={f.id}>
                {f.flightNumber} — {f.route || "route not set"} ({fmtFlightWhen(f.when) || "time not set"})
              </option>
            ))}
          </select>
        </Field>
      </Panel>

      {!flight ? (
        <Panel style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          No flights on the board yet. Ask an on-duty staff member to open one first.
        </Panel>
      ) : (
        <OffDutyFlightPanel
          flight={flight}
          roster={roster}
          rosterById={rosterById}
          guestLog={guestLog}
          setGuestLog={setGuestLog}
          onUpdate={onUpdateFlight}
        />
      )}
    </div>
  );
}

function OffDutyFlightPanel({ flight, roster, rosterById, guestLog, setGuestLog, onUpdate }) {
  const [staffId, setStaffId] = useState("");
  const [currentClass, setCurrentClass] = useState("EC");
  const [desiredClass, setDesiredClass] = useState("");
  const [allocatedPriority, setAllocatedPriority] = useState(false);
  const [guestStaffId, setGuestStaffId] = useState("");
  const [guestName, setGuestName] = useState("");

  const selected = rosterById.get(staffId);
  const eligible = selected ? eligibleDesiredClasses(currentClass, selected.rankIdx) : [];

  useEffect(() => {
    setDesiredClass(eligible[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, currentClass]);

  const addStandby = () => {
    if (!selected || !desiredClass) return;
    const entry = {
      id: uid(),
      staffId: selected.id,
      name: selected.name,
      rankIdx: selected.rankIdx,
      currentClass,
      desiredClass,
      allocatedPriority,
      isGuest: false,
      status: "waiting",
      requestedAt: Date.now(),
    };
    onUpdate({ ...flight, standby: [...flight.standby, entry] });
    setStaffId("");
    setAllocatedPriority(false);
  };

  const weekKey = weekKeyHKT();
  const guestUsedThisWeek = (sid) => guestLog.some((g) => g.staffId === sid && g.weekKey === weekKey);
  const guestStaffUsed = guestStaffId && guestUsedThisWeek(guestStaffId);

  const addGuestRequest = () => {
    const s = rosterById.get(guestStaffId);
    if (!s || !guestName.trim() || guestUsedThisWeek(s.id)) return;
    const entry = {
      id: uid(),
      staffId: s.id,
      name: s.name,
      rankIdx: s.rankIdx,
      guestName: guestName.trim(),
      currentClass: null,
      desiredClass: "BC",
      isGuest: true,
      status: "waiting",
      requestedAt: Date.now(),
      requestedAtWeek: weekKey,
    };
    onUpdate({ ...flight, standby: [...flight.standby, entry] });
    setGuestLog([
      ...guestLog,
      {
        id: uid(),
        staffId: s.id,
        staffName: s.name,
        guestName: guestName.trim(),
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        weekKey,
        timestamp: Date.now(),
      },
    ]);
    setGuestStaffId("");
    setGuestName("");
  };

  const sortedQueue = (list) => [...list].sort((a, b) => (b.allocatedPriority ? 1 : 0) - (a.allocatedPriority ? 1 : 0) || a.rankIdx - b.rankIdx || a.requestedAt - b.requestedAt);
  const standbyQueue = sortedQueue(flight.standby.filter((s) => !s.isGuest));
  const guestQueue = sortedQueue(flight.standby.filter((s) => s.isGuest));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Open premium seats right now</div>
        <div style={{ display: "flex", gap: 18 }}>
          {CLASSES.filter((c) => c.id !== "EC").map((c) => (
            <div key={c.id} style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", color: flight.seats[c.id] > 0 ? "var(--green)" : "var(--text-dim)" }}>
              <div>{c.id}</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{flight.seats[c.id]}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Join standby queue</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Your name">
            <StaffPicker roster={roster} value={staffId} onChange={setStaffId} placeholder="Type your name…" width={200} />
          </Field>
          <Field label="Current ticketed class">
            <select style={inputStyle} value={currentClass} onChange={(e) => setCurrentClass(e.target.value)}>
              {CLASSES.filter((c) => c.id !== "FC").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Requesting upgrade to">
            <select style={inputStyle} value={desiredClass} onChange={(e) => setDesiredClass(e.target.value)} disabled={!eligible.length}>
              {eligible.length === 0 && <option value="">—</option>}
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Btn onClick={addStandby} disabled={!selected || !desiredClass}>
            + Add to queue
          </Btn>
        </div>

        <label
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12.5,
            color: "var(--text)",
            cursor: "pointer",
            background: allocatedPriority ? "var(--panel2)" : "transparent",
            border: "1px solid var(--line)",
            borderRadius: 7,
            padding: "8px 10px",
          }}
        >
          <input
            type="checkbox"
            checked={allocatedPriority}
            onChange={(e) => setAllocatedPriority(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            Were you allocated to work this flight as staff, 2 hours prior to briefing time?
            <br />
            <span style={{ color: "var(--text-dim)", fontSize: 11.5 }}>
              If yes, you get priority in the standby queue ahead of seniority order, and it's noted in the log.
            </span>
          </span>
        </label>

        {selected && isTrainee(selected.rankIdx) && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-dim)", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={12} /> Trainees may only move up exactly one class.
          </div>
        )}
      </Panel>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Guest to Business Class</div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
          Each staff member gets 1 guest seat in Business per week.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Staff username">
            <StaffPicker roster={roster} value={guestStaffId} onChange={setGuestStaffId} placeholder="Type your name…" width={200} />
          </Field>
          <Field label="Guest user">
            <input
              style={{ ...inputStyle, width: 180 }}
              placeholder="Guest's name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </Field>
          <Btn onClick={addGuestRequest} disabled={!guestStaffId || !guestName.trim() || guestStaffUsed}>
            + Request guest seat
          </Btn>
        </div>
        {guestStaffUsed && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--jade)", display: "flex", gap: 6, alignItems: "center" }}>
            <AlertTriangle size={12} /> That staff member already used their guest seat this week.
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <QueueList title="Your standby queue" icon={ListOrdered} entries={standbyQueue} seats={flight.seats} readOnly />
        <QueueList title="Guest request queue" icon={Gift} entries={guestQueue} seats={flight.seats} guestMode readOnly />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ROSTER TAB
---------------------------------------------------------------- */
function RosterTab({ roster, setRoster, unlocked, setUnlocked }) {
  const [name, setName] = useState("");
  const [rankIdx, setRankIdx] = useState(RANKS.length - 1);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState(null);

  const add = () => {
    if (!name.trim()) return;
    setRoster([...roster, { id: uid(), name: name.trim(), rankIdx: Number(rankIdx), addedAt: Date.now() }]);
    setName("");
  };
  const remove = (id) => setRoster(roster.filter((s) => s.id !== id));

  const bulkAdd = () => {
    const { rows, unmatched } = parseRosterPaste(pasteText);
    const byName = new Map(roster.map((s) => [s.name.trim().toLowerCase(), s]));
    const next = [...roster];
    let added = 0,
      updated = 0;
    rows.forEach(({ name: n, rankIdx: ri }) => {
      const key = n.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        if (existing.rankIdx !== ri) {
          next[next.findIndex((s) => s.id === existing.id)] = { ...existing, rankIdx: ri };
          updated++;
        }
      } else {
        const entry = { id: uid(), name: n, rankIdx: ri, addedAt: Date.now() };
        next.push(entry);
        byName.set(key, entry);
        added++;
      }
    });
    if (added || updated) setRoster(next);
    setPasteResult({ added, updated, unmatched });
    if (added || updated) setPasteText("");
  };

  const grouped = useMemo(() => {
    const bands = ["CX", "EX", "HR", "MR", "LR"];
    return bands.map((b) => ({
      band: b,
      members: roster.filter((s) => RANKS[s.rankIdx].band === b).sort((a, b2) => a.rankIdx - b2.rankIdx),
    }));
  }, [roster]);

  if (!unlocked) {
    return (
      <Panel style={{ padding: 20, maxWidth: 320 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
          <Lock size={14} /> Roster is locked
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 12 }}>
          Enter the roster password to view or edit staff.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="password"
            style={inputStyle}
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (pwInput === ROSTER_PASSWORD) {
                setUnlocked(true);
                setPwError("");
              } else setPwError("Wrong password.");
            }}
            placeholder="Password"
          />
          {pwError && <div style={{ fontSize: 11.5, color: "var(--red)" }}>{pwError}</div>}
          <Btn
            onClick={() => {
              if (pwInput === ROSTER_PASSWORD) {
                setUnlocked(true);
                setPwError("");
              } else setPwError("Wrong password.");
            }}
          >
            Unlock
          </Btn>
        </div>
      </Panel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={() => setUnlocked(false)}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={13} /> Lock roster
          </span>
        </Btn>
      </div>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={14} /> Bulk add from paste
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
          Paste rows straight from a spreadsheet — one staff member per line, name then rank (tab or comma
          separated). Rank can be "Chief Pilot" or "HR | Chief Pilot". Names that already exist just get their
          rank updated instead of duplicated.
        </div>
        <textarea
          style={{ ...inputStyle, width: "100%", minHeight: 110, fontFamily: "var(--font-mono)", resize: "vertical" }}
          placeholder={"John Tan\tChief Pilot\nMei Lin\tCabin Crew"}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <div style={{ marginTop: 8 }}>
          <Btn onClick={bulkAdd} disabled={!pasteText.trim()}>
            Add these staff
          </Btn>
        </div>
        {pasteResult && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {(pasteResult.added > 0 || pasteResult.updated > 0) && (
              <div style={{ color: "var(--green)" }}>
                Added {pasteResult.added}, updated {pasteResult.updated}.
              </div>
            )}
            {pasteResult.unmatched.length > 0 && (
              <div style={{ color: "#B08D57", marginTop: 4 }}>
                {pasteResult.unmatched.length} row(s) had a rank that didn't match and were skipped:{" "}
                {pasteResult.unmatched.map((u) => `${u.name} ("${u.rankText}")`).join(", ")}
              </div>
            )}
            {pasteResult.added === 0 && pasteResult.updated === 0 && pasteResult.unmatched.length === 0 && (
              <div style={{ color: "var(--text-dim)" }}>Nothing recognizable in that paste.</div>
            )}
          </div>
        )}
      </Panel>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
          <UserPlus size={14} /> Add staff member
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Name">
            <input style={{ ...inputStyle, width: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="In-sim name" />
          </Field>
          <Field label="Rank">
            <select style={{ ...inputStyle, width: 240 }} value={rankIdx} onChange={(e) => setRankIdx(e.target.value)}>
              {RANKS.map((r) => (
                <option key={r.idx} value={r.idx}>
                  {r.band} | {r.title}
                </option>
              ))}
            </select>
          </Field>
          <Btn onClick={add}>+ Add to roster</Btn>
        </div>
      </Panel>

      {roster.length === 0 ? (
        <Panel style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          Roster is empty. Add staff so they can be selected for standby.
        </Panel>
      ) : (
        grouped.map(
          (g) =>
            g.members.length > 0 && (
              <Panel key={g.band} style={{ padding: 14 }}>
                <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: BAND_COLOR[g.band], marginBottom: 8 }}>
                  {g.band} BAND
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.members.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <div style={{ flex: 1 }}>{s.name}</div>
                      <RankBadge rankIdx={s.rankIdx} />
                      <button
                        onClick={() => remove(s.id)}
                        style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 4 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            )
        )
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   GUEST PRIVILEGE TRACKER TAB
---------------------------------------------------------------- */
function GuestTab({ roster, guestLog, flights }) {
  const weekKey = weekKeyHKT();
  const thisWeek = guestLog.filter((g) => g.weekKey === weekKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>This week's guest usage (week of {weekKey})</div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
          1 Business Class guest seat per staff member, per week. Used seats reset automatically next week.
        </div>
        {thisWeek.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No guest seats used yet this week.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {thisWeek
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((g) => (
                <div key={g.id} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
                  <CheckCircle2 size={13} color="var(--green)" />
                  <span>{g.staffName}</span>
                  {g.guestName && (
                    <span style={{ color: "var(--text-dim)" }}>
                      brought <span style={{ color: "var(--text)" }}>{g.guestName}</span>
                    </span>
                  )}
                  <span style={{ color: "var(--text-dim)" }}>on</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--jade)" }}>{g.flightNumber}</span>
                  <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>{fmtTime(g.timestamp)}</span>
                </div>
              ))}
          </div>
        )}
      </Panel>

      <Panel style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Roster availability</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Roster is empty.</div>}
          {roster
            .slice()
            .sort((a, b) => a.rankIdx - b.rankIdx)
            .map((s) => {
              const used = thisWeek.some((g) => g.staffId === s.id);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <div style={{ flex: 1 }}>{s.name}</div>
                  <RankBadge rankIdx={s.rankIdx} />
                  <span
                    style={{
                      fontSize: 11.5,
                      color: used ? "var(--red)" : "var(--green)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {used ? "used" : "available"}
                  </span>
                </div>
              );
            })}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   LOG TAB — every accepted/denied request, across all flights
---------------------------------------------------------------- */
function LogTab({ flights, onClearLog }) {
  const [confirming, setConfirming] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const entries = useMemo(() => {
    const all = [];
    (flights || []).forEach((f) => {
      f.standby
        .filter((s) => s.status !== "waiting")
        .forEach((s) => all.push({ ...s, flightNumber: f.flightNumber, route: f.route }));
    });
    return all.sort((a, b) => (b.processedAt || b.requestedAt) - (a.processedAt || a.requestedAt));
  }, [flights]);

  const attemptClear = () => {
    if (pwInput !== ROSTER_PASSWORD) {
      setPwError("Wrong password.");
      return;
    }
    onClearLog();
    setConfirming(false);
    setPwInput("");
    setPwError("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", flex: 1, minWidth: 240 }}>
          Every upgrade and guest request that's been seated or denied, across every flight — who requested it, which
          flight, which cabin to which cabin, who processed it, and when.
        </div>
        {!confirming ? (
          <Btn variant="ghost" onClick={() => setConfirming(true)} disabled={entries.length === 0}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={13} /> Clear log
            </span>
          </Btn>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Clear all {entries.length} entries? Enter the roster password to confirm.</span>
            <input
              type="password"
              style={{ ...inputStyle, width: 140 }}
              placeholder="Password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attemptClear()}
            />
            {pwError && <span style={{ fontSize: 11.5, color: "var(--red)" }}>{pwError}</span>}
            <Btn variant="danger" onClick={attemptClear}>
              Yes, clear
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setPwInput("");
                setPwError("");
              }}
            >
              Cancel
            </Btn>
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <Panel style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          Nothing logged yet — entries appear here once a gate agent seats or denies a request.
        </Panel>
      ) : (
        <Panel style={{ padding: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((h) => (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                  borderRadius: 7,
                  background: "var(--panel2)",
                  border: "1px solid var(--line)",
                  flexWrap: "wrap",
                  fontSize: 12.5,
                }}
              >
                {h.status === "assigned" ? <CheckCircle2 size={13} color="var(--green)" /> : <XCircle size={13} color="var(--red)" />}
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{h.name}</span>
                {h.allocatedPriority && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "var(--jade)", padding: "1px 6px", borderRadius: 4 }}>
                    PRIORITY
                  </span>
                )}
                <RankBadge rankIdx={h.rankIdx} />
                <span style={{ color: "var(--text-dim)" }}>
                  {h.isGuest ? `guest request for ${h.guestName || "unnamed guest"}` : "upgrade request"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--jade)" }}>{h.flightNumber}</span>
                {h.route && <span style={{ color: "var(--text-dim)" }}>{h.route}</span>}
                {!h.isGuest && <ClassPill id={h.currentClass} />}
                {!h.isGuest && <ChevronRight size={12} color="var(--text-dim)" />}
                <ClassPill id={h.desiredClass} />
                {h.requestedClass && (
                  <span style={{ fontSize: 10.5, color: "var(--jade)" }}>(requested {h.requestedClass})</span>
                )}
                <StatusPill status={h.status} />
                {h.processedBy && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-dim)" }}>
                    by <span style={{ color: "var(--text)" }}>{h.processedBy.name}</span>
                    <RankBadge rankIdx={h.processedBy.rankIdx} />
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {fmtTime(h.processedAt || h.requestedAt)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
