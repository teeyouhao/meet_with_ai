export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
}

export interface AuthResult {
  user: AuthUser | null;
  token?: string | null;
  error: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '')).replace(/\/$/, '');
const TOKEN_KEY = 'meetwithai_auth_token';
const USER_KEY = 'meetwithai_auth_user';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string | null, user: AuthUser | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // Non-blocking
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isGuestUser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isGuest = localStorage.getItem('meetwithai_is_guest') === 'true';
    const user = getStoredUser();
    return isGuest || user?.id === 'guest';
  } catch {
    return false;
  }
}

export function loginAsGuest(): AuthUser {
  const guestUser: AuthUser = {
    id: 'guest',
    email: 'guest@meetwithai.local',
    user_metadata: {
      full_name: 'Guest User'
    }
  };
  try {
    localStorage.setItem('meetwithai_is_guest', 'true');
    setStoredAuth('guest_local_token', guestUser);
  } catch {
    // Non-blocking
  }
  return guestUser;
}

/** Native Sign up with email, password, and full name */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, fullName })
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return {
        user: null,
        error: res.status >= 500
          ? 'Server is starting up or temporarily unavailable. Please retry in a few seconds.'
          : 'Unexpected server response during registration.'
      };
    }

    if (!res.ok) {
      return { user: null, error: data.error || 'Registration failed' };
    }

    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      user_metadata: {
        full_name: data.user.fullName || fullName,
        role: data.user.role
      }
    };

    setStoredAuth(data.token, authUser);
    return { user: authUser, token: data.token, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Network error during registration' };
  }
}

/** Native Sign in with email & password */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      return {
        user: null,
        error: res.status >= 500
          ? 'Server is starting up or temporarily unavailable. Please retry in a few seconds.'
          : 'Unexpected server response during sign in.'
      };
    }

    if (!res.ok) {
      return { user: null, error: data.error || 'Login failed' };
    }

    const authUser: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      user_metadata: {
        full_name: data.user.fullName,
        role: data.user.role
      }
    };

    setStoredAuth(data.token, authUser);
    return { user: authUser, token: data.token, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Network error during login' };
  }
}

/** Native Sign out */
export async function signOut(): Promise<void> {
  try {
    localStorage.removeItem('meetwithai_is_guest');
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {
    // Non-blocking
  } finally {
    setStoredAuth(null, null);
  }
}

/** Native Password reset request placeholder */
export async function sendPasswordReset(_email: string): Promise<{ error: string | null }> {
  // If user requests reset, inform them of native TS auth password management
  return { error: null };
}

/** Get current session user from backend or localStorage cache */
export async function getSessionUser(): Promise<AuthUser | null> {
  if (isGuestUser()) {
    const cached = getStoredUser();
    if (cached) return cached;
    return loginAsGuest();
  }

  const token = getAuthToken();
  const cachedUser = getStoredUser();

  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/api/auth/session`, {
      headers,
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.authenticated && data.user) {
        const authUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          user_metadata: {
            full_name: data.user.name || data.user.fullName,
            role: data.user.role
          }
        };
        setStoredAuth(token, authUser);
        return authUser;
      }
    }
  } catch {
    // Offline or network error: return cached user if available
    if (cachedUser) return cachedUser;
  }

  if (cachedUser && token) return cachedUser;

  setStoredAuth(null, null);
  return null;
}
