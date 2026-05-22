import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon, RotateCcw, Pause, Play, SkipBack, SkipForward } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Persona = "citizen" | "officer" | "patrol";

interface Scene {
  id:             number;
  narration:      string;  // main headline shown to the audience
  subtext:        string;  // supporting detail
  left:           Persona;
  right:          Persona;
  mini:           Persona;
  action?:        string;  // POST endpoint to call on enter (relative path)
  duration:       number;  // ms; -1 = hold indefinitely (last scene)
}

// ── Config ─────────────────────────────────────────────────────────────────────

const PERSONA_LABEL: Record<Persona, string> = {
  citizen: "👩  Citizen — Ananya Krishnan",
  officer: "🛡️  Control Room — SI Murugan",
  patrol:  "🚔  Patrol PPV-1 — Const. Ravi Kumar",
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

const SCENES: Scene[] = [
  {
    id: 1,
    narration: "Singapenne — Real-Time Women Safety Operations",
    subtext:   "Four patrol vehicles, live GPS, citizen-to-officer communication. All in one system.",
    left:  "citizen", right: "officer", mini: "patrol",
    duration: 5000,
  },
  {
    id: 2,
    narration: "Ananya Krishnan raises an SOS",
    subtext:   "She taps the SOS button, selects Harassment, adds a brief note. GPS location captured automatically.",
    left: "citizen", right: "officer", mini: "patrol",
    action: "/api/demo/step/raise-sos",
    duration: 7000,
  },
  {
    id: 3,
    narration: "Alert received — Control Room on alert",
    subtext:   "The complaint glows red with an audible tone. Severity: SEVERE. SI Murugan sees it instantly.",
    left: "officer", right: "citizen", mini: "patrol",
    duration: 6000,
  },
  {
    id: 4,
    narration: "SI Murugan dispatches PPV-1",
    subtext:   "One click assigns the nearest patrol vehicle. PPV-1 begins moving toward Ananya on the live map.",
    left: "officer", right: "patrol", mini: "citizen",
    action: "/api/demo/step/dispatch",
    duration: 9000,
  },
  {
    id: 5,
    narration: "Constable Kumar accepts the complaint",
    subtext:   "The complaint appears in his queue, glowing red. He accepts — a navigation line appears on his map.",
    left: "patrol", right: "officer", mini: "citizen",
    action: "/api/demo/step/patrol-accept",
    duration: 7000,
  },
  {
    id: 6,
    narration: "Citizen notified — PPV-1 en route",
    subtext:   "Ananya sees 'PPV-1 assigned · ETA 4 min'. A live chat opens so she can communicate with the officer.",
    left: "citizen", right: "patrol", mini: "officer",
    duration: 5000,
  },
  {
    id: 7,
    narration: "Two-way communication — live",
    subtext:   "Patrol: 'On my way — ETA 4 min.' Citizen shares her exact location. Messages appear in real time.",
    left: "citizen", right: "patrol", mini: "officer",
    action: "/api/demo/step/chat",
    duration: 13000,
  },
  {
    id: 8,
    narration: "PPV-1 arrives on scene",
    subtext:   "Constable Kumar marks arrival. Control Room sees the 'On Scene' badge update instantly.",
    left: "patrol", right: "officer", mini: "citizen",
    action: "/api/demo/step/arrive",
    duration: 6000,
  },
  {
    id: 9,
    narration: "Crime confirmed — CSR filed",
    subtext:   "Report submitted. FIR workflow triggered. Victim escorted to Vandalur AWPS. Case logged in the system.",
    left: "patrol", right: "officer", mini: "citizen",
    action: "/api/demo/step/file-csr",
    duration: 8000,
  },
  {
    id: 10,
    narration: "Citizen safe — case resolved",
    subtext:   "Ananya sees the green safety overlay. PPV-1 returns to patrol. End-to-end in under 12 minutes.",
    left: "citizen", right: "officer", mini: "patrol",
    duration: -1,
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const { theme, toggle } = useTheme();
  const [sceneIdx,   setSceneIdx]   = useState(0);
  const [elapsed,    setElapsed]    = useState(0);
  const [isPaused,   setIsPaused]   = useState(false);
  const [resetState, setResetState] = useState<"idle" | "loading" | "done">("idle");
  const [fade,       setFade]       = useState(false);

  // Iframes are always in the DOM — only their CSS gridArea changes, no reloads
  const iframeRefs = useRef<Partial<Record<Persona, HTMLIFrameElement | null>>>({});
  // Pause offset: how much time already elapsed when we paused
  const pauseOffsetRef = useRef(0);

  const scene = SCENES[sceneIdx];
  const isLast = sceneIdx === SCENES.length - 1;

  // Grid layout — persona → "left" | "right" | "mini"
  const layout: Record<Persona, string> = {
    citizen: scene.left === "citizen" ? "left" : scene.right === "citizen" ? "right" : "mini",
    officer: scene.left === "officer" ? "left" : scene.right === "officer" ? "right" : "mini",
    patrol:  scene.left === "patrol"  ? "left" : scene.right === "patrol"  ? "right" : "mini",
  };

  // ── Scene entry: fire API action, reset timer ──────────────────────────────
  useEffect(() => {
    pauseOffsetRef.current = 0;
    setElapsed(0);
    setFade(false);
    if (SCENES[sceneIdx].action) {
      const base = import.meta.env.VITE_API_URL ?? "";
      fetch(`${base}${SCENES[sceneIdx].action}`, { method: "POST" }).catch(() => {});
    }
  }, [sceneIdx]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPaused) return;
    if (scene.duration < 0) return; // last scene — hold indefinitely

    const wallStart = Date.now();
    const offset    = pauseOffsetRef.current;

    const id = setInterval(() => {
      const e = offset + (Date.now() - wallStart);
      if (e >= scene.duration) {
        clearInterval(id);
        setElapsed(scene.duration);
        // Brief fade then advance
        setFade(true);
        setTimeout(() => setSceneIdx(i => Math.min(i + 1, SCENES.length - 1)), 160);
      } else {
        setElapsed(e);
      }
    }, 50);

    return () => clearInterval(id);
  }, [sceneIdx, isPaused, scene.duration]);

  // ── Pause / resume ─────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    setIsPaused(p => {
      if (!p) pauseOffsetRef.current = elapsed; // save where we are
      return !p;
    });
  }, [elapsed]);

  // ── Manual skip ───────────────────────────────────────────────────────────
  const skip = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(sceneIdx + delta, SCENES.length - 1));
    if (next === sceneIdx) return;
    setFade(true);
    setTimeout(() => { setSceneIdx(next); setIsPaused(false); }, 160);
  }, [sceneIdx]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    setResetState("loading");
    try {
      const base = import.meta.env.VITE_API_URL ?? "";
      await fetch(`${base}/api/demo/reset`, { method: "POST" });
    } catch { /* ignore */ }
    Object.values(iframeRefs.current).forEach(el => { if (el) el.src = el.src; });
    setFade(true);
    setTimeout(() => {
      setSceneIdx(0);
      setIsPaused(false);
      setFade(false);
      pauseOffsetRef.current = 0;
    }, 200);
    setResetState("done");
    setTimeout(() => setResetState("idle"), 2500);
  }, []);

  // ── Progress bar width ────────────────────────────────────────────────────
  const progressPct = scene.duration > 0 ? Math.min((elapsed / scene.duration) * 100, 100) : 100;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height:        "100vh",
      display:       "flex",
      flexDirection: "column",
      background:    "var(--bg-base)",
      fontFamily:    "system-ui, sans-serif",
      overflow:      "hidden",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        height:       54,
        background:   "var(--surface-L1)",
        borderBottom: "1px solid var(--border)",
        display:      "flex",
        alignItems:   "center",
        gap:          12,
        padding:      "0 14px",
        flexShrink:   0,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🛡️</div>
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>Singapenne</div>
            <div style={{ color: "var(--text-muted)", fontSize: 9 }}>Live Demo</div>
          </div>
        </div>

        {/* LIVE badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "#dc262618", border: "1px solid #dc262644", flexShrink: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626", animation: "livePulse 1.4s ease-in-out infinite" }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "#dc2626", letterSpacing: "0.06em" }}>LIVE</span>
        </div>

        {/* Scene dots */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => skip(i - sceneIdx)}
              title={s.narration}
              style={{
                width:        i === sceneIdx ? 22 : 8,
                height:       8,
                borderRadius: 4,
                border:       "none",
                cursor:       "pointer",
                background:   i === sceneIdx ? "#dc2626" : i < sceneIdx ? "#dc262666" : "var(--border-strong)",
                transition:   "all 0.25s ease",
                padding:      0,
                flexShrink:   0,
              }}
            />
          ))}
          <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
            {sceneIdx + 1} / {SCENES.length}
          </span>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <button onClick={() => skip(-1)} disabled={sceneIdx === 0} title="Previous scene" style={iconBtn(sceneIdx === 0)}>
            <SkipBack size={13} />
          </button>
          <button
            onClick={togglePause}
            title={isPaused ? "Resume" : "Pause"}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 12px", borderRadius: 6,
              border: isPaused ? "none" : "1px solid var(--border)",
              background: isPaused ? "#dc2626" : "var(--surface-L2)",
              color:      isPaused ? "#fff"     : "var(--text-secondary)",
              cursor: "pointer", fontSize: 11, fontWeight: 700,
            } as React.CSSProperties}>
            {isPaused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}
          </button>
          <button onClick={() => skip(1)} disabled={isLast} title="Next scene" style={iconBtn(isLast)}>
            <SkipForward size={13} />
          </button>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 3px" }} />

          <button onClick={handleReset} disabled={resetState === "loading"} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            border:     resetState === "done" ? "1px solid #22c55e" : "1px solid var(--border)",
            background: resetState === "done" ? "rgba(34,197,94,0.12)" : "transparent",
            color:      resetState === "done" ? "#22c55e" : "var(--text-muted)",
            cursor: resetState === "loading" ? "wait" : "pointer",
            transition: "all 0.2s",
          }}>
            {resetState === "done"
              ? "✓ Ready"
              : <><RotateCcw size={10} style={resetState === "loading" ? { animation: "spin 0.8s linear infinite" } : undefined} /> Restart</>
            }
          </button>

          <button onClick={toggle} style={iconBtn(false)}>
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <a href="/" style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, textDecoration: "none", padding: "4px 9px", border: "1px solid var(--border)", borderRadius: 6 }}>← Back</a>
        </div>
      </div>

      {/* ── Main pane grid ─────────────────────────────────────────────────── */}
      {/*
        All 3 iframes stay in the DOM permanently.
        Changing `gridArea` is a CSS-only change — no iframe reload, state preserved.
        Grid: top 1fr = two big spotlight panes, bottom 175px = mini preview.
      */}
      <div style={{
        flex:                1,
        display:             "grid",
        gridTemplateAreas:   `"left right" "mini mini"`,
        gridTemplateRows:    "1fr 175px",
        gridTemplateColumns: "1fr 1fr",
        gap:                 6,
        padding:             6,
        overflow:            "hidden",
        minHeight:           0,
        opacity:             fade ? 0.1 : 1,
        transition:          "opacity 0.16s ease",
      }}>
        {(["citizen", "officer", "patrol"] as Persona[]).map(persona => {
          const role   = layout[persona];
          const isMini = role === "mini";
          const color  = PERSONA_COLOR[persona];

          return (
            <div
              key={persona}
              style={{
                gridArea:      role,
                display:       "flex",
                flexDirection: "column",
                borderRadius:  10,
                overflow:      "hidden",
                border:        `1px solid var(--border)`,
                boxShadow:     isMini ? "none" : `0 0 0 2px ${color}40`,
                minWidth:      0,
                minHeight:     0,
              }}
            >
              {/* Label bar */}
              <div style={{
                background:   isMini ? "var(--surface-L2)" : "var(--surface-L1)",
                padding:      isMini ? "3px 12px" : "6px 14px",
                borderBottom: "1px solid var(--border)",
                borderLeft:   `3px solid ${color}`,
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                flexShrink:   0,
              }}>
                <span style={{ fontSize: isMini ? 9 : 11, fontWeight: 800, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  {PERSONA_LABEL[persona]}
                </span>
                {isMini && (
                  <span style={{ marginLeft: "auto", fontSize: 8, color: "var(--text-muted)", background: "var(--surface-L3)", padding: "1px 5px", borderRadius: 3 }}>
                    preview
                  </span>
                )}
              </div>

              {/* Iframe */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
                <iframe
                  ref={el => { iframeRefs.current[persona] = el; }}
                  src={PERSONA_URL[persona]}
                  title={PERSONA_LABEL[persona]}
                  style={{ width: "100%", height: "100%", border: "none", pointerEvents: isMini ? "none" : "auto" }}
                />
                {isMini && <div style={{ position: "absolute", inset: 0 }} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Narration bar ──────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   "var(--surface-L1)",
        borderTop:    "1px solid var(--border)",
        padding:      "10px 18px 6px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 8 }}>
          {/* Scene counter badge */}
          <div style={{
            flexShrink:   0,
            background:   "#dc2626",
            color:        "#fff",
            fontSize:     9,
            fontWeight:   900,
            padding:      "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.05em",
            marginTop:    2,
          }}>
            {sceneIdx + 1} / {SCENES.length}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 2 }}>
              {scene.narration}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {scene.subtext}
            </div>
          </div>

          {/* Pause state indicator */}
          {isPaused && (
            <div style={{
              flexShrink:   0,
              fontSize:     10,
              fontWeight:   800,
              color:        "#f59e0b",
              background:   "rgba(245,158,11,0.1)",
              border:       "1px solid rgba(245,158,11,0.3)",
              padding:      "3px 8px",
              borderRadius: 4,
              marginTop:    2,
            }}>
              ⏸ PAUSED
            </div>
          )}
          {isLast && !isPaused && (
            <div style={{
              flexShrink:   0,
              fontSize:     10,
              fontWeight:   800,
              color:        "#22c55e",
              background:   "rgba(34,197,94,0.1)",
              border:       "1px solid rgba(34,197,94,0.3)",
              padding:      "3px 8px",
              borderRadius: 4,
              marginTop:    2,
            }}>
              ✓ COMPLETE
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, borderRadius: 2, background: "var(--surface-L2)", overflow: "hidden" }}>
          <div style={{
            height:     "100%",
            borderRadius: 2,
            background: isLast ? "#22c55e" : "#dc2626",
            width:      `${progressPct}%`,
            transition: "width 0.05s linear",
          }} />
        </div>
      </div>

      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes livePulse  { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }
      `}</style>
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────
const iconBtn = (disabled: boolean): React.CSSProperties => ({
  display:    "flex",
  alignItems: "center",
  justifyContent: "center",
  width:      28,
  height:     28,
  borderRadius: 6,
  border:     "1px solid var(--border)",
  background: "transparent",
  color:      disabled ? "var(--text-muted)" : "var(--text-secondary)",
  cursor:     disabled ? "not-allowed" : "pointer",
  opacity:    disabled ? 0.4 : 1,
  flexShrink: 0,
});
