export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy accent tokens (preserved for any remaining uses)
        accent: {
          blue: "#3b82f6",
          red: "#dc2626",
          orange: "#f59e0b",
          green: "#22c55e",
          purple: "#7c3aed",
          teal: "#14b8a6",
        },
        severity: {
          low: "#22c55e",
          moderate: "#f59e0b",
          severe: "#dc2626",
        },
        // Light neutral scale (citizen UI + legacy)
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        // Surface palette — responds to theme via CSS variables
        surface: {
          L1: "var(--surface-L1)",
          L2: "var(--surface-L2)",
          L3: "var(--surface-L3)",
        },
        // Semantic border colors — responds to theme
        border: {
          DEFAULT: "var(--border)",
          strong:  "var(--border-strong)",
        },
        // Text scale — responds to theme
        text: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted:     "var(--text-muted)",
        },
        // Base background — responds to theme
        bg: {
          dark: "var(--bg-base)",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.1)",
        "card-dark": "0 1px 3px rgba(0,0,0,0.4), 0 1px 8px rgba(0,0,0,0.3)",
        "sos-ring": "0 0 0 16px rgba(220,38,38,0.15), 0 0 0 32px rgba(220,38,38,0.07)",
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "sos-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(220,38,38,0.5)" },
          "70%": { boxShadow: "0 0 0 20px rgba(220,38,38,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(220,38,38,0)" },
        },
        "flash-update": {
          "0%, 100%": { backgroundColor: "transparent" },
          "50%": { backgroundColor: "rgba(59,130,246,0.12)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "sos-ring": "sos-ring 2s ease-out infinite",
        "flash-update": "flash-update 1s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
