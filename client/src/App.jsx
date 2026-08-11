import { useState } from "react";
import { useAuth } from "./lib/auth/AuthProvider";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const { user, isAuthenticated, loading, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Dashboard />;
  }

  const submit = async (event) => {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const result = await signIn(email.trim(), password);

      if (result.error) {
        setError(
          "Invalid email or password. Please check your credentials. Test credentials are available in the README."
        );
        return;
      }
    } catch (err) {
      setError(
        `Invalid email or password. Please check your credentials.
         **Test credentials are available in the README.**`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">FLOWFORGE AI</p>

        <h1>AI Agent Workflow Builder</h1>

        <p className="muted">
          Sign in to manage organization-scoped workflows.
        </p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
              placeholder="Enter your email"
              autoComplete="email"
              required
              disabled={busy}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>

          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary full"
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}