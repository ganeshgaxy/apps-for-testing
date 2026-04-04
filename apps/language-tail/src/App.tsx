import { useState, useEffect, type FormEvent } from "react";
import {
  authenticateUser,
  registerUser,
  getSession,
  saveSession,
  clearSession,
} from "./auth";

interface LoginForm {
  email: string;
  password: string;
}

interface SignupForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

type View = "login" | "signup";

const NAV_ITEMS = [
  { icon: "🏠", label: "Home", id: "home" },
  { icon: "📱", label: "Electronics", id: "electronics" },
  { icon: "👕", label: "Clothing", id: "clothing" },
  { icon: "📚", label: "Books", id: "books" },
  { icon: "⚽", label: "Sports", id: "sports" },
  { icon: "💄", label: "Beauty", id: "beauty" },
  { icon: "🧸", label: "Toys", id: "toys" },
  { icon: "🌿", label: "Home & Garden", id: "garden" },
];

const PRODUCTS = [
  {
    id: 1,
    name: "Wireless Headphones",
    price: 89.99,
    category: "electronics",
    emoji: "🎧",
    badge: "Best Seller",
  },
  {
    id: 2,
    name: "Running Shoes",
    price: 64.99,
    category: "sports",
    emoji: "👟",
    badge: "New",
  },
  {
    id: 3,
    name: "JavaScript: The Good Parts",
    price: 29.99,
    category: "books",
    emoji: "📗",
    badge: null,
  },
  {
    id: 4,
    name: "Yoga Mat",
    price: 34.99,
    category: "sports",
    emoji: "🧘",
    badge: "Sale",
  },
  {
    id: 5,
    name: "Smartwatch Pro",
    price: 199.99,
    category: "electronics",
    emoji: "⌚",
    badge: "Hot",
  },
  {
    id: 6,
    name: "Denim Jacket",
    price: 79.99,
    category: "clothing",
    emoji: "🧥",
    badge: null,
  },
  {
    id: 7,
    name: "Bluetooth Speaker",
    price: 49.99,
    category: "electronics",
    emoji: "🔊",
    badge: "Sale",
  },
  {
    id: 8,
    name: "Skincare Gift Set",
    price: 44.99,
    category: "beauty",
    emoji: "🧴",
    badge: "New",
  },
];

function getDisplayName(email: string): string {
  const name = email.split("@")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ── Signup Page ──
function SignupPage({
  onSignIn,
  onSuccess,
}: {
  onSignIn: () => void;
  onSuccess: (email: string) => void;
}) {
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
    else if (form.password.length < 6)
      errs.password = "Password must be at least 6 characters.";
    if (!form.confirm) errs.confirm = "Please confirm your password.";
    else if (form.confirm !== form.password)
      errs.confirm = "Passwords do not match.";
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
    onSuccess(form.email.toLowerCase().trim());
  };

  const passwordsMatch =
    form.confirm.length > 0 && form.password === form.confirm;

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
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name}</span>
            )}
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
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
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
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="su-confirm">
              Confirm password
              {passwordsMatch && (
                <span className="match-check"> ✓ Passwords match</span>
              )}
            </label>
            <input
              id="su-confirm"
              type="password"
              placeholder="Re-enter password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
              className={
                fieldErrors.confirm
                  ? "input-error"
                  : passwordsMatch
                    ? "input-ok"
                    : ""
              }
            />
            {fieldErrors.confirm && (
              <span className="field-error">{fieldErrors.confirm}</span>
            )}
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
          <button className="link-btn" onClick={onSignIn}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

function HomePage({
  onLogout,
  email,
}: {
  onLogout: () => void;
  email: string;
}) {
  const [activeNav, setActiveNav] = useState("home");
  const [cart, setCart] = useState<number[]>([]);

  const displayName = getDisplayName(email);
  const initials = displayName.slice(0, 2).toUpperCase();

  const visibleProducts =
    activeNav === "home"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeNav);

  const sectionLabel =
    activeNav === "home"
      ? "Featured Products"
      : (NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? "Products");

  const addToCart = (id: number) => setCart((prev) => [...prev, id]);

  return (
    <div className="shop-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">ShopZone</span>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-email">{email}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => setActiveNav(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={onLogout}>
            🚪 Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="shop-main">
        <header className="shop-header">
          <div>
            <h1 className="shop-title">{sectionLabel}</h1>
            <p className="shop-subtitle">
              {visibleProducts.length} item
              {visibleProducts.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="header-actions">
            <div className="search-box">
              <span>🔍</span>
              <input type="text" placeholder="Search products…" />
            </div>
            <button className="cart-btn">
              🛒 Cart
              {cart.length > 0 && (
                <span className="cart-badge">{cart.length}</span>
              )}
            </button>
          </div>
        </header>

        {activeNav === "home" && (
          <div className="hero-banner">
            <div className="hero-text">
              <h2>Welcome back, {displayName}! 👋</h2>
              <p>Discover today's best deals handpicked just for you.</p>
              <button
                className="hero-cta"
                onClick={() => setActiveNav("electronics")}
              >
                Shop Electronics →
              </button>
            </div>
            <div className="hero-emoji">🛍️</div>
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="empty-state">
            <span>📭</span>
            <p>No products in this category yet.</p>
          </div>
        ) : (
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <div key={product.id} className="product-card">
                {product.badge && (
                  <span
                    className={`product-badge badge-${product.badge.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {product.badge}
                  </span>
                )}
                <div className="product-emoji">{product.emoji}</div>
                <h3 className="product-name">{product.name}</h3>
                <p className="product-price">${product.price.toFixed(2)}</p>
                <button
                  className="add-to-cart-btn"
                  onClick={() => addToCart(product.id)}
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  // Restore session from localStorage on first render
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(() =>
    getSession(),
  );
  const [view, setView] = useState<View>("login");
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [wrongCreds, setWrongCreds] = useState(false);
  const [loading, setLoading] = useState(false);

  // Keep session storage in sync whenever loggedInEmail changes
  useEffect(() => {
    if (loggedInEmail) {
      saveSession(loggedInEmail);
    } else {
      clearSession();
    }
  }, [loggedInEmail]);

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
      setLoggedInEmail(result);
    } else {
      setWrongCreds(true);
      setError("Those credentials don't match. Please try again.");
    }
  };

  const handleLogout = () => {
    setLoggedInEmail(null);
    setForm({ email: "", password: "" });
    setError(null);
    setWrongCreds(false);
    setView("login");
  };

  if (loggedInEmail) {
    return <HomePage onLogout={handleLogout} email={loggedInEmail} />;
  }

  if (view === "signup") {
    return (
      <SignupPage
        onSignIn={() => setView("login")}
        onSuccess={(email) => setLoggedInEmail(email)}
      />
    );
  }

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
          <button className="link-btn" onClick={() => setView("signup")}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}
