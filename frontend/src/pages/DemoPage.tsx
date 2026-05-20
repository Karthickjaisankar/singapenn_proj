export default function DemoPage() {
  const panes = [
    { label: "👩 Citizen View",           url: "/login?autoLogin=citizen&demo=1" },
    { label: "🛡️ Police Personnel View",  url: "/login?autoLogin=officer&demo=1" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f172a",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 20px",
          background: "#1e293b",
          borderBottom: "1px solid #334155",
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
          <span style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 14, letterSpacing: "-0.3px" }}>
            Singapenne — Live Demo
          </span>
          <span
            style={{
              marginLeft: 12,
              color: "#64748b",
              fontSize: 12,
            }}
          >
            Raise SOS on the left → see it appear on the right in real time
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <a
          href="/"
          style={{
            color: "#475569",
            fontSize: 11,
            fontWeight: 600,
            textDecoration: "none",
            padding: "4px 10px",
            border: "1px solid #334155",
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
              border: "1px solid #334155",
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: "#1e293b",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "#94a3b8",
                flexShrink: 0,
                borderBottom: "1px solid #334155",
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
