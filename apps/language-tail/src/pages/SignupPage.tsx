import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser, saveSession } from "../auth";

interface SignupForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SignupForm>({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<SignupForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (field: keyof SignupForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((fe) => ({ ...fe, [field]: undefined }));
    setError(null);
  };

  const validate = (): boolean => {
    const errs: Partial<SignupForm> = {};
    if (!form.name.trim()) errs.name = "Full name is required.";
    if (!form.email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "Enter a valid email address.";
    if (!form.password) errs.password = "Password is required.";
    else if (form.password.length < 6) errs.password = "Password must be at least 6 characters.";
    if (!form.confirm) errs.confirm = "Please confirm your password.";
    else if (form.confirm !== form.password) errs.confirm = "Passwords do not match.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    const result = registerUser(form.email, form.password, form.name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    saveSession(form.email.toLowerCase().trim());
    navigate("/home");
  };

  const passwordsMatch = form.confirm.length > 0 && form.password === form.confirm;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">⚡</div>
          <h1>Create account</h1>
          <p>Join ShopZone today — it's free</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="su-name">Full name</label>
            <input
              id="su-name"
              type="text"
              placeholder="Jane Smith"
              autoComplete="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="su-email">Email</label>
            <input
              id="su-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="su-password">Password</label>
            <input
              id="su-password"
              type="password"
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </div>

          <div className="field">
            <label htmlFor="su-confirm">
              Confirm password
              {passwordsMatch && <span className="match-check"> ✓ Passwords match</span>}
            </label>
            <input
              id="su-confirm"
              type="password"
              placeholder="Re-enter password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
              className={fieldErrors.confirm ? "input-error" : passwordsMatch ? "input-ok" : ""}
            />
            {fieldErrors.confirm && <span className="field-error">{fieldErrors.confirm}</span>}
          </div>

          {error && (
            <div className="error-box">
              <p className="error-msg">{error}</p>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="signup-prompt">
          Already have an account?{" "}
          <button className="link-btn" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
