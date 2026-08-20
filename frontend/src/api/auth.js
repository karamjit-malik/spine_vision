import { api } from "@/api/axios";
import { mockApi } from "@/api/mockServer";
import { USE_MOCK } from "@/lib/constants";

/** Unwrap the { success, data } envelope the backend returns. */
const unwrap = (response) => response.data?.data ?? response.data;

export async function login({ email, password }) {
  if (USE_MOCK) return mockApi.login({ email, password });
  return unwrap(await api.post("/auth/login", { email, password }));
}

export async function register({ name, email, password }) {
  if (USE_MOCK) return mockApi.register({ name, email, password });
  return unwrap(await api.post("/auth/register", { name, email, password }));
}

export async function refreshToken(refresh_token) {
  return unwrap(await api.post("/auth/refresh", { refresh_token }));
}
