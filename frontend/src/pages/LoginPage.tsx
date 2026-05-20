import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Eye, EyeOff, Shield } from "lucide-react";

const DEMO_CREDENTIALS = [
  { label: "Police Personnel", username: "officer1", password: "officer1pass", color: "text-blue-400 border-blue-500/30 hover:bg-blue-500/10" },
  { label: "Citizen", username: "citizen1", password: "citizen1pass", color: "text-green-400 border-green-500/30 hover:bg-green-500/10" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const doLogin = async (u: string, p: string) => {
    setError("");
    setLoading(true);
    try {
      const authUser = await login(u, p);
      if (authUser.role === "officer") navigate("/officer");
      else if (authUser.role === "commissioner") navigate("/commissioner");
      else navigate("/citizen");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await doLogin(username, password);
  };

  // Auto-login for demo iframes: ?autoLogin=citizen or ?autoLogin=officer
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("autoLogin");
    if (!role) return;
    const cred = DEMO_CREDENTIALS.find((c) =>
      role === "citizen" ? c.username.startsWith("citizen") : c.username.startsWith("officer")
    );
    if (!cred) return;
    setUsername(cred.username);
    setPassword(cred.password);
    const t = setTimeout(() => doLogin(cred.username, cred.password), 900);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center p-4">
      {/* Subtle radial glow behind card */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">Singapenne Scheme</h1>
          <p className="text-sm text-text-muted mt-1">சிங்கப்பெண் சிறப்பு அதிரடிப்படை</p>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl border border-border bg-surface-L1 p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-text-primary mb-5">Sign in</h2>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                disabled={loading}
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-L2 border border-border text-text-primary placeholder-text-muted text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
                           disabled:opacity-50 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-surface-L2 border border-border text-text-primary placeholder-text-muted text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
                             disabled:opacity-50 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm
                         transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : "Sign In"}
            </button>
          </form>

          {/* Demo quick-fill buttons */}
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">
              Demo access
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_CREDENTIALS.map((cred) => (
                <button
                  key={cred.username}
                  type="button"
                  onClick={() => { setUsername(cred.username); setPassword(cred.password); setError(""); }}
                  className={`text-[11px] font-semibold px-2 py-2 rounded-lg border bg-transparent transition ${cred.color}`}
                >
                  {cred.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-text-muted mt-6">
          Tamil Nadu Police · Singappen Special Force
        </p>

        <div className="text-center mt-3">
          <a
            href="/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            <span>🖥️</span> View Live Demo — Citizen &amp; Officer side-by-side
          </a>
        </div>
      </div>
    </div>
  );
}
