const tokenStorageKey = "mikuru-realworld-token";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(tokenStorageKey);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(tokenStorageKey, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(tokenStorageKey);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}
