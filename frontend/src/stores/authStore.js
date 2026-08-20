import { create } from "zustand";

const REFRESH_KEY = "spine-vision-refresh";
const USER_KEY = "spine-vision-user";

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) ?? null;
  } catch {
    return null;
  }
};

export const useAuthStore = create((set) => ({
  user: readUser(),
  // Access token stays in memory only; the refresh token is the dev-mode fallback.
  accessToken: null,
  refreshToken: localStorage.getItem(REFRESH_KEY),

  setSession: ({ user, access_token, refresh_token }) => {
    localStorage.setItem(REFRESH_KEY, refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, accessToken: access_token, refreshToken: refresh_token });
  },

  setTokens: (access_token, refresh_token) => {
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
    set((state) => ({
      accessToken: access_token,
      refreshToken: refresh_token ?? state.refreshToken,
    }));
  },

  logout: () => {
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
