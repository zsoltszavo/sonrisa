/**
 * The signed-in user's access token. It lives in localStorage so a reload keeps the session;
 * the server re-reads the User and role on every request (D19d), so the token is the only state.
 */
const STORAGE_KEY = 'sonrisa.accessToken';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode, policies); the session then lasts until reload.
    return memoryToken;
  }
}

let memoryToken: string | null = null;

function write(token: string | null) {
  memoryToken = token;
  try {
    if (token === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // See read(): fall back to the in-memory copy.
  }
  for (const listener of listeners) listener();
}

// Another tab signed in or out: tell this tab's subscribers so it doesn't keep sending a token
// that no longer matches what it shows.
const externalListeners = new Set<Listener>();
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    memoryToken = event.newValue;
    for (const listener of externalListeners) listener();
    for (const listener of listeners) listener();
  });
}

export const session = {
  getToken: read,
  signIn: (token: string) => {
    write(token);
  },
  signOut: () => {
    write(null);
  },
  /** Runs only for changes made in another tab (e.g. to drop cached data of the previous user). */
  onExternalChange: (listener: Listener) => {
    externalListeners.add(listener);
    return () => {
      externalListeners.delete(listener);
    };
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
