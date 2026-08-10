import { useState } from "react";
import { useAuth } from "./lib/auth/AuthProvider";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const { user, isAuthenticated, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="auth-screen"><div className="auth-card">Loading…</div></div>;
  if (isAuthenticated && user) return <Dashboard />;

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const result = await signIn(email, password);
    if (result.error) setError(result.error.message);
    setBusy(false);
  };

  return <div className="auth-screen">
    <div className="auth-card">
      <p className="eyebrow">FLOWFORGE AI</p>
      <h1>AI Agent Workflow Builder</h1>
      <p className="muted">Sign in to manage organization-scoped workflows.</p>
      <form onSubmit={submit}>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="primary full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  </div>;
}
