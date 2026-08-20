import axios from "axios";
import { useAuthStore } from "@/stores/authStore";

export const api = axios.create({
  // 5001, not 5000 — macOS AirPlay Receiver holds 5000. See README.
  baseURL: `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001"}/api`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status !== 401 || original?._retry || original?.url?.includes("/auth/")) {
      return Promise.reject(error);
    }

    original._retry = true;
    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    try {
      // Collapse parallel 401s into a single refresh round-trip.
      refreshing ??= api
        .post("/auth/refresh", { refresh_token: refreshToken })
        .finally(() => {
          refreshing = null;
        });
      const { data } = await refreshing;
      const payload = data.data ?? data;
      setTokens(payload.access_token, payload.refresh_token);
      original.headers.Authorization = `Bearer ${payload.access_token}`;
      return api(original);
    } catch (refreshError) {
      logout();
      return Promise.reject(refreshError);
    }
  }
);
