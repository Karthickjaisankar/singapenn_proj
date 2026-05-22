import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";

type DemoView = "command" | "patrol";

const PANES: Record<DemoView, { label: string; url: string }[]> = {
  command: [
    { label: "👩 Citizen View",       url: "/login?autoLogin=citizen&demo=1" },
    { label: "🛡️ Command Centre",     url: "/login?autoLogin=officer&demo=1" },
    { label: "⭐ Commissioner View",  url: "/login?autoLogin=commissioner&demo=1" },
  ],
  patrol: [
    { label: "👩 Citizen View",        url: "/login?autoLogin=citizen&demo=1" },
    { label: "🚔 Patrol Officer View", url: "/login?autoLogin=patrol&demo=1" },
  ],
};

const SUBTITLES: Record<DemoView, string> = {
  command: "Raise SOS on the left → see it appear on Command Centre and Commissioner in real time",
  patrol:  "Raise SOS as citizen → dispatch from Command Centre → patrol officer receives and accepts",
};

export default function DemoPage() {
  const { theme, toggle } = useTheme();
  const [demoView, setDemoView] = useState<DemoView>("command");

  const panes = PANES[demoView];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-base)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 20px",
          background: "var(--surface-L1)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "#dc2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          🛡️
        </div>
        <div>
          <span style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 14, letterSpacing: "-0.3px" }}>
            Singapenne — Live Demo
          </span>
          <span style={{ marginLeft: 12, color: "var(--text-secondary)", fontSize: 12 }}>
            {SUBTITLES[demoView]}
          </span>
        </div>
        <div style={{ flex: 1 }} />

        {/* View switcher tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--surface-L2)",
            borderRadius: 8,
            padding: 3,
            border: "1px solid var(--border)",
          }}
        >
          {(["command", "patrol"] as DemoView[]).map((v) => (
            <button
              key={v}
              onClick={() => setDemoView(v)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                transition: "all 0.15s",
                background: demoView === v ? "var(--surface-L1)" : "transparent",
                color: demoView === v ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: demoView === v ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
              }}
            >
              {v === "command" ? "Command View" : "Patrol View"}
            </button>
          ))}
        </div>

        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <a
          href="/"
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            textDecoration: "none",
            padding: "4px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          ← Back
        </a>
      </div>

      {/* Split panes */}
      <div
        className="demo-panes"
        style={{
          flex: 1,
          display: "flex",
          gap: 8,
          padding: 8,
          overflow: "hidden",
        }}
      >
        {panes.map(({ label, url }) => (
          <div
            key={url}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--border)",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: "var(--surface-L1)",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-secondary)",
                flexShrink: 0,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {label}
            </div>
            <iframe
              src={url}
              style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
              title={label}
            />
          </div>
        ))}
      </div>

      {/* Mobile note */}
      <style>{`
        @media (max-width: 640px) {
          .demo-panes { flex-direction: column !important; }
          .demo-panes > div { height: 50vh; flex: none !important; }
        }
      `}</style>
    </div>
  );
}
