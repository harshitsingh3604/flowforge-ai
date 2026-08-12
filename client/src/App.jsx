import { useState } from "react";
import { useAuth } from "./lib/auth/AuthProvider";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const { user, isAuthenticated, loading, signIn } = useAuth();
  const [email, setEmail] = useState("owner.a@acme.example");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="loading-screen"><div className="card loading-card">Loading FlowForge…</div></div>;
  if (isAuthenticated && user) return <Dashboard />;

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password) return setError("Email and password are required.");
    setBusy(true); setError("");
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) setError(result.error.message || "Invalid email or password.");
    } catch (e) {
      setError(e.message || "Unable to sign in.");
    } finally { setBusy(false); }
  }

  return (
  <div className="auth-page">
    <div className="auth-card card">
      <div className="brand auth-brand">
        <div className="brand-mark">F</div>
        <div>
          <strong>FlowForge AI</strong>
          <span>Assessment workflow control plane</span>
        </div>
      </div>
      <p className="eyebrow">SECURE SIGN IN</p>
      <h1>Run AI workflows with durable state.</h1>
      <p className="muted">Nhost handles authentication while Hasura enforces organization-scoped data access.
      </p>
      <form onSubmit={submit}>
        <label>
          Email
          <input autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label>Password
          <input type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </label>
        {error &&
          <div className="alert">{error}
          </div>}
        <button className="primary auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="auth-note">
        <strong>Assessment accounts</strong>
        <span>Owner A · owner.a@acme.example</span>
        <span>Editor A · editor.a@acme.example</span>
        <span>Viewer A · viewer.a@acme.example</span>
        <span>Owner B · owner.b@beta.example</span>
        <span>Password is provided in the assessment additional notes.</span>
      </div>
    </div>
  </div>
  );
}
