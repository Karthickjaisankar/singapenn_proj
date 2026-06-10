import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon, RotateCcw } from "lucide-react";

type Persona = "citizen" | "officer" | "patrol";

const PERSONA_LABEL: Record<Persona, string> = {
  citizen: "👩  Citizen — Anita Krishnan",
  officer: "🛡️  Control Room — SI Murugan",
  patrol:  "🚔  Patrol PPV-1 — Const. Ravi Kumar",
};

const PERSONA_SHORT: Record<Persona, string> = {
  citizen: "👩  Citizen",
  officer: "🛡️  Control Room",
  patrol:  "🚔  Patrol PPV-1",
};

const PERSONA_COLOR: Record<Persona, string> = {
  citizen: "#3b82f6",
  officer: "#dc2626",
  patrol:  "#10b981",
};

const PERSONA_URL: Record<Persona, string> = {
  citizen: "/login?autoLogin=citizen&demo=1",
  officer: "/login?autoLogin=officer&demo=1",
  patrol:  "/login?autoLogin=patrol&demo=1",
};

const ALL_PERSONAS: Persona[] = ["citizen", "officer", "patrol"];

export default function DemoPage() {
  const { theme, toggle } = useTheme();

  // Ordered pair: [left, right]. All 3 iframes stay in DOM — only display changes.
  const [visible, setVisible] = useState<[Persona, Persona]>(["citizen", "officer"]);
  const [resetState, setResetState] = useState<"idle" | "loading" | "done">("idle");
  const iframeRefs = useRef<Partial<Record<Persona, HTMLIFrameElement | null>>>({});

  // Toggle a persona on/off. Max 2 shown at a time.
  // Clicking a hidden persona bumps out the one that was added first (FIFO).
  const togglePersona = useCallback((p: Persona) => {
    setVisible(prev => {
      if (prev.includes(p)) {
        // Deselect — keep the other one and pick the "next" hidden persona to fill
        // but only if there's another hidden one; otherwise keep both
        const other = prev[0] === p ? prev[1] : prev[0];
        const hidden = ALL_PERSONAS.find(x => x !== p && x !== other);
        return hidden ? [other, hidden] : prev;
      } else {
        // Add p, bump out index 0 (oldest), keep index 1 (newest) + p
        return [prev[1], p];
      }
    });
  }, []);

  // When a persona becomes visible, the Leaflet map inside was initialized with 0×0
  // dimensions (display:none container). Firing resize on the iframe window makes
  // Leaflet call invalidateSize() and repaint at the correct dimensions.
  useEffect(() => {
    const t = setTimeout(() => {
      visible.forEach(p => {
        try { iframeRefs.current[p]?.contentWindow?.dispatchEvent(new Event("resize")); } catch {}
      });
    }, 80);
    return () => clearTimeout(t);
  }, [visible]);

  const handleReset = useCallback(async () => {
    setResetState("loading");
    try {
      const base = import.meta.env.VITE_API_URL ?? "";
      await fetch(`${base}/api/demo/reset`, { method: "POST" });
    } catch { /* ignore */ }
    Object.values(iframeRefs.current).forEach(el => { if (el) el.src = el.src; });
    setResetState("done");
    setTimeout(() => setResetState("idle"), 2500);
  }, []);

  return (
    <div style={{
      height:        "100vh",
      display:       "flex",
      flexDirection: "column",
      background:    "var(--bg-base)",
      fontFamily:    "system-ui, sans-serif",
      overflow:      "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        height:       54,
        background:   "var(--surface-L1)",
        borderBottom: "1px solid var(--border)",
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "0 14px",
        flexShrink:   0,
      }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <img src="/singapenne-logo.png" alt="Singapen Task Force" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "contain" }} />
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>Singapen Task Force</div>
            <div style={{ color: "var(--text-muted)", fontSize: 9 }}>Live Demo</div>
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />

        {/* Persona filter chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {ALL_PERSONAS.map(p => {
            const active = visible.includes(p);
            const color  = PERSONA_COLOR[p];
            return (
              <button
                key={p}
                onClick={() => togglePersona(p)}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          5,
                  padding:      "5px 12px",
                  borderRadius: 20,
                  border:       active ? `1.5px solid ${color}` : "1.5px solid var(--border)",
                  background:   active ? `${color}18` : "transparent",
                  color:        active ? color : "var(--text-muted)",
                  cursor:       "pointer",
                  fontSize:     11,
                  fontWeight:   700,
                  transition:   "all 0.18s ease",
                  whiteSpace:   "nowrap",
                  flexShrink:   0,
                }}
              >
                {active && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                )}
                {PERSONA_SHORT[p]}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleReset}
            disabled={resetState === "loading"}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        4,
              padding:    "5px 11px",
              borderRadius: 6,
              fontSize:   10,
              fontWeight: 700,
              border:     resetState === "done" ? "1px solid #22c55e" : "1px solid var(--border)",
              background: resetState === "done" ? "rgba(34,197,94,0.12)" : "transparent",
              color:      resetState === "done" ? "#22c55e" : "var(--text-muted)",
              cursor:     resetState === "loading" ? "wait" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {resetState === "done"
              ? "✓ Ready"
              : <><RotateCcw size={10} style={resetState === "loading" ? { animation: "spin 0.8s linear infinite" } : undefined} /> Reset Demo</>
            }
          </button>

          <button onClick={toggle} style={iconBtn}>
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          <a href="/" style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textDecoration: "none", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
            ← Back
          </a>
        </div>
      </div>

      {/* ── Panes ── */}
      {/*
        All 3 iframes are always in the DOM.
        Hidden ones use display:none so state is fully preserved — no reloads when toggling.
      */}
      <div style={{ flex: 1, display: "flex", gap: 6, padding: 6, overflow: "hidden", minHeight: 0 }}>
        {ALL_PERSONAS.map(persona => {
          const isVisible = visible.includes(persona);
          const color = PERSONA_COLOR[persona];
          return (
            <div
              key={persona}
              style={{
                display:       isVisible ? "flex" : "none",
                flexDirection: "column",
                flex:          1,
                borderRadius:  10,
                overflow:      "hidden",
                border:        "1px solid var(--border)",
                boxShadow:     `0 0 0 2px ${color}30`,
                minWidth:      0,
                minHeight:     0,
              }}
            >
              {/* Label bar */}
              <div style={{
                background:   "var(--surface-L1)",
                padding:      "6px 14px",
                borderBottom: "1px solid var(--border)",
                borderLeft:   `3px solid ${color}`,
                display:      "flex",
                alignItems:   "center",
                flexShrink:   0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>
                  {PERSONA_LABEL[persona]}
                </span>
              </div>

              {/* Iframe */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
                <iframe
                  ref={el => { iframeRefs.current[persona] = el; }}
                  src={PERSONA_URL[persona]}
                  title={PERSONA_LABEL[persona]}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  width:          28,
  height:         28,
  borderRadius:   6,
  border:         "1px solid var(--border)",
  background:     "transparent",
  color:          "var(--text-secondary)",
  cursor:         "pointer",
  flexShrink:     0,
};
