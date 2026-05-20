import { useEffect, useState, useCallback } from "react";
import { Navigation, AlertTriangle, FileText, Users, Plus, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { PatrolAnomalyResponse, IncidentReport, FoPVolunteer } from "../types";
import { useAuth } from "../contexts/AuthContext";

const CRIME_HEAD_OPTIONS = [
  { value: "pocso_rape",          label: "POCSO — Penetrative Rape",    mandatory: true  },
  { value: "pocso_other",         label: "POCSO — Other Offences",      mandatory: false },
  { value: "child_marriage_rape", label: "Child Marriage + Rape",        mandatory: true  },
  { value: "child_marriage_other",label: "Child Marriage — Other",       mandatory: false },
  { value: "sc_st_rape",          label: "SC/ST — Rape",                 mandatory: true  },
  { value: "sc_st_other",         label: "SC/ST — Other",                mandatory: false },
];

const MANDATORY_FIR_HEADS = new Set(["pocso_rape", "child_marriage_rape", "sc_st_rape"]);

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ReportTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    dsr: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    csr: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    fir: "bg-red-500/20 text-red-300 border border-red-500/30",
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${styles[type] || "bg-surface-L2 text-text-secondary"}`}>
      {type}
    </span>
  );
}

export default function OperationsPanel() {
  const { user } = useAuth();
  const token = user?.token || "";

  const [anomalyData, setAnomalyData] = useState<PatrolAnomalyResponse | null>(null);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [pendingFirs, setPendingFirs] = useState<IncidentReport[]>([]);
  const [volunteers, setVolunteers] = useState<FoPVolunteer[]>([]);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newReport, setNewReport] = useState({ crime_head: "pocso_other", description: "", place: "" });
  const [submitting, setSubmitting] = useState(false);
  const [lastPromotion, setLastPromotion] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [ar, rr, pr, vr] = await Promise.allSettled([
      api.patrolAnomalies(token),
      api.getReports(token),
      api.getPendingFir(token),
      api.getFoPVolunteers(token),
    ]);
    if (ar.status === "fulfilled") setAnomalyData(ar.value);
    if (rr.status === "fulfilled") setReports(rr.value.reports);
    if (pr.status === "fulfilled") setPendingFirs(pr.value.reports);
    if (vr.status === "fulfilled") setVolunteers(vr.value.volunteers);
  }, [token]);

  useEffect(() => { reload(); }, [reload]);
  // Poll anomalies every 2 minutes
  useEffect(() => {
    const id = setInterval(() => {
      api.patrolAnomalies(token).then(setAnomalyData).catch(() => {});
    }, 120_000);
    return () => clearInterval(id);
  }, [token]);

  async function submitReport() {
    if (!newReport.crime_head) return;
    setSubmitting(true);
    try {
      const res = await api.createReport(token, {
        report_type: "dsr",
        crime_head: newReport.crime_head,
        description: newReport.description || undefined,
        place: newReport.place || undefined,
      });
      if (res.auto_promoted_to_fir) {
        setLastPromotion(`DSR auto-promoted to FIR — ${newReport.crime_head} is a mandatory FIR crime.`);
      }
      setShowNewReport(false);
      setNewReport({ crime_head: "pocso_other", description: "", place: "" });
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEscalate(reportId: number, to: "csr" | "fir") {
    await api.escalateReport(token, reportId, to);
    reload();
  }

  async function handleVerifyFoP(fopId: number) {
    await api.verifyFoP(token, fopId);
    reload();
  }

  const openReports = reports.filter(r => r.status === "open" && r.report_type === "dsr");
  const recentFirs  = reports.filter(r => r.report_type === "fir").slice(0, 5);

  return (
    <div className="h-full overflow-y-auto bg-bg-dark p-4 space-y-4">

      {/* ── Patrol Anomaly Dashboard ────────────────────────────────── */}
      <div className="bg-surface-L1 rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-3">
          <Navigation className="w-4 h-4 text-accent-blue" />
          Fleet Health
        </h3>

        {/* Fleet health badges */}
        {anomalyData && (
          <div className="flex gap-2 flex-wrap mb-3">
            {anomalyData.fleet_km.map(fk => {
              const isAnomaly = anomalyData.anomalies.some(a => a.vehicle_id === fk.vehicle_id);
              return (
                <div
                  key={fk.vehicle_id}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${
                    isAnomaly
                      ? "bg-red-500/20 border-red-500/40 text-red-300"
                      : "bg-green-500/20 border-green-500/40 text-green-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isAnomaly ? "bg-red-500 animate-pulse" : "bg-green-500"}`} />
                  V{fk.vehicle_id}
                </div>
              );
            })}
          </div>
        )}

        {/* Anomalies */}
        {anomalyData?.anomalies && anomalyData.anomalies.length > 0 ? (
          <div className="space-y-2">
            {anomalyData.anomalies.map(a => (
              <div key={a.vehicle_id} className="border border-red-500/40 bg-red-500/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-red-300">
                    Vehicle V{a.vehicle_id} — ANOMALY ⚠
                  </span>
                  <span className="text-[10px] font-bold text-red-400 uppercase">{a.status}</span>
                </div>
                <div className="flex gap-4 text-[11px] text-red-400">
                  <span>Stationary: <strong>{a.stationary_minutes} min</strong></span>
                  <span>KM today: <strong>{a.km_today} km</strong></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text-secondary">
            {anomalyData ? "All vehicles healthy — no anomalies detected." : "Loading fleet data…"}
          </p>
        )}

        {/* KM summary */}
        {anomalyData && anomalyData.fleet_km.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {anomalyData.fleet_km.map(fk => (
              <div key={fk.vehicle_id} className="flex items-center justify-between px-2 py-1.5 bg-surface-L2 rounded-lg border border-border">
                <span className="text-xs font-semibold text-text-primary">V{fk.vehicle_id}</span>
                <span className="text-xs font-bold text-text-primary">{fk.km_today} km today</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DSR / FIR Queue ─────────────────────────────────────────── */}
      <div className="bg-surface-L1 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-purple-500" />
            DSR / FIR Queue
          </h3>
          <button
            onClick={() => { setShowNewReport(v => !v); setLastPromotion(null); }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition"
          >
            <Plus className="w-3.5 h-3.5" /> File Report
          </button>
        </div>

        {/* Auto-promotion notice */}
        {lastPromotion && (
          <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-[11px] text-red-300 font-medium flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {lastPromotion}
          </div>
        )}

        {/* New report form */}
        {showNewReport && (
          <div className="mb-4 p-3 bg-surface-L2 border border-border rounded-xl space-y-2">
            <p className="text-[11px] font-semibold text-text-primary">New Incident Report</p>
            <select
              value={newReport.crime_head}
              onChange={e => setNewReport(p => ({ ...p, crime_head: e.target.value }))}
              className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-L2 text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            >
              {CRIME_HEAD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.mandatory ? "⚠ [FIR] " : ""}{opt.label}
                </option>
              ))}
            </select>
            {MANDATORY_FIR_HEADS.has(newReport.crime_head) && (
              <p className="text-[10px] text-red-400 font-semibold">
                ⚠ This crime head requires a direct FIR — DSR will be auto-promoted.
              </p>
            )}
            <input
              type="text"
              placeholder="Place of incident"
              value={newReport.place}
              onChange={e => setNewReport(p => ({ ...p, place: e.target.value }))}
              className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-L2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              value={newReport.description}
              onChange={e => setNewReport(p => ({ ...p, description: e.target.value }))}
              className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-L2 text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            />
            <div className="flex gap-2">
              <button
                onClick={submitReport}
                disabled={submitting}
                className="flex-1 py-1.5 bg-accent-blue text-white rounded-lg text-xs font-semibold hover:bg-accent-blue/90 disabled:opacity-50 transition"
              >
                {submitting ? "Filing…" : "File Report"}
              </button>
              <button
                onClick={() => setShowNewReport(false)}
                className="px-3 py-1.5 border border-border rounded-lg text-xs text-text-secondary hover:bg-surface-L2 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Pending FIR conversion */}
        {pendingFirs.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">
              ⚠ Pending FIR Conversion ({pendingFirs.length})
            </p>
            {pendingFirs.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 mb-1 bg-red-500/10 border border-red-500/20 rounded-lg">
                <ReportTypeBadge type={r.report_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-text-primary truncate">{r.crime_head}</p>
                  {r.place && <p className="text-[10px] text-text-secondary">{r.place}</p>}
                </div>
                <button
                  onClick={() => handleEscalate(r.id, "fir")}
                  className="shrink-0 text-[10px] font-bold text-white bg-red-600 px-2 py-1 rounded hover:bg-red-700 transition"
                >
                  → FIR
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Open DSRs */}
        <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
          Open DSRs ({openReports.length})
        </p>
        {openReports.length === 0 ? (
          <p className="text-[12px] text-text-muted">No open DSRs.</p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {openReports.map(r => (
              <div key={r.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-surface-L2">
                <ReportTypeBadge type={r.report_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-text-primary truncate">{r.crime_head}</p>
                  <p className="text-[10px] text-text-muted">{r.place || "—"} · {timeAgo(r.created_at)}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleEscalate(r.id, "csr")}
                    className="text-[9px] font-bold text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded hover:bg-blue-500/10"
                  >
                    → CSR
                  </button>
                  <button
                    onClick={() => handleEscalate(r.id, "fir")}
                    className="text-[9px] font-bold text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded hover:bg-red-500/10"
                  >
                    → FIR
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent FIRs */}
        {recentFirs.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Recent FIRs</p>
            <div className="space-y-1.5">
              {recentFirs.map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2 border border-border rounded-lg bg-surface-L2">
                  <ReportTypeBadge type="fir" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-text-primary truncate">{r.crime_head}</p>
                    <p className="text-[10px] text-text-muted">
                      {r.place || "—"} · {timeAgo(r.created_at)}
                      {r.escalated_to && <span className="text-blue-500"> · escalated from {r.report_type}</span>}
                    </p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Friend of Police ─────────────────────────────────────────── */}
      <div className="bg-surface-L1 rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-3">
          <Users className="w-4 h-4 text-green-500" />
          Friend of Police Volunteers
          <span className="ml-auto text-[11px] text-text-secondary">
            {volunteers.filter(v => v.verified).length}/{volunteers.length} verified
          </span>
        </h3>
        {volunteers.length === 0 ? (
          <p className="text-[12px] text-text-muted">No volunteers registered yet.</p>
        ) : (
          <div className="space-y-1.5">
            {volunteers.map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-surface-L2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${v.verified ? "bg-green-500" : "bg-amber-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-text-primary">{v.full_name}</p>
                  <p className="text-[10px] text-text-muted">{v.area || "Area not specified"} · {timeAgo(v.created_at)}</p>
                </div>
                {v.verified ? (
                  <span className="text-[10px] text-green-400 font-bold">Verified</span>
                ) : (
                  <button
                    onClick={() => handleVerifyFoP(v.id)}
                    className="text-[10px] font-bold text-white bg-green-600 px-2 py-0.5 rounded hover:bg-green-700 transition"
                  >
                    Verify
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
