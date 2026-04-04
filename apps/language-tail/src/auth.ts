// ── Storage keys ──
const USERS_KEY = "shopzone:users";
const SESSION_KEY = "shopzone:session";

// ── Types ──
export interface StoredUser {
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

// ── Helpers ──

/**
 * Demo-only "hash" using btoa. NOT suitable for production.
 * In a real app use bcrypt / Argon2 on the server side.
 */
function hashPassword(email: string, password: string): string {
  return btoa(unescape(encodeURIComponent(`${email.toLowerCase()}::${password}`)));
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ── Seed the built-in admin account on first boot ──
(function seedAdmin() {
  const ADMIN_EMAIL = "admin@example.com";
  const users = getUsers();
  if (!users.some((u) => u.email === ADMIN_EMAIL)) {
    users.push({
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(ADMIN_EMAIL, "password123"),
      displayName: "Admin",
      createdAt: new Date().toISOString(),
    });
    saveUsers(users);
  }
})();

// ── Public API ──

/**
 * Register a new user. Returns { ok: true } on success or
 * { ok: false, error: string } if the email is already taken.
 */
export function registerUser(
  email: string,
  password: string,
  displayName: string,
): { ok: true } | { ok: false; error: string } {
  const normalised = email.toLowerCase().trim();
  const users = getUsers();
  if (users.some((u) => u.email === normalised)) {
    return { ok: false, error: "An account with this email already exists." };
  }
  users.push({
    email: normalised,
    passwordHash: hashPassword(normalised, password),
    displayName: displayName.trim(),
    createdAt: new Date().toISOString(),
  });
  saveUsers(users);
  return { ok: true };
}

/**
 * Verify credentials. Returns the normalised email on success, null on failure.
 */
export function authenticateUser(email: string, password: string): string | null {
  const normalised = email.toLowerCase().trim();
  const users = getUsers();
  const user = users.find((u) => u.email === normalised);
  if (!user) return null;
  if (user.passwordHash !== hashPassword(normalised, password)) return null;
  return user.email;
}

/** Returns the display name stored for an email, or null if not found. */
export function getDisplayNameForEmail(email: string): string | null {
  const users = getUsers();
  return users.find((u) => u.email === email.toLowerCase())?.displayName ?? null;
}

// ── Session persistence ──

/** Read the persisted session email from localStorage. */
export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Persist a session for the given email. */
export function saveSession(email: string): void {
  localStorage.setItem(SESSION_KEY, email);
}

/** Clear the persisted session (logout). */
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
