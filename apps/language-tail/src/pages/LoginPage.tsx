import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authenticateUser, getSession, saveSession } from "../auth";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [wrongCreds, setWrongCreds] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (getSession()) {
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setWrongCreds(false);

    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);

    const result = authenticateUser(form.email, form.password);
    if (result) {
      saveSession(result);
      navigate("/home");
    } else {
      setWrongCreds(true);
      setError("Those credentials don't match. Please try again.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">⚡</div>
          <h1>Welcome back</h1>
          <p>Sign in to your account</p>
        </div>

        <div className="credentials-hint">
          <span>Demo credentials</span>
          <code>admin@example.com / password123</code>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                setError(null);
                setWrongCreds(false);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value });
                setError(null);
                setWrongCreds(false);
              }}
            />
          </div>

          {error && (
            <div className="error-box">
              <p className="error-msg">{error}</p>
              {wrongCreds && (
                <a href="#" className="forgot-link-error">
                  Forgot your password?
                </a>
              )}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="forgot-inline">
          <a href="#" className="forgot-link">
            Forgot password?
          </a>
        </p>

        <p className="signup-prompt">
          Don't have an account?{" "}
          <button className="link-btn" onClick={() => navigate("/signup")}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}
