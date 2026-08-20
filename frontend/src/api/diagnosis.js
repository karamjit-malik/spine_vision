import { api } from "@/api/axios";
import { mockApi } from "@/api/mockServer";
import { USE_MOCK } from "@/lib/constants";
import { useAuthStore } from "@/stores/authStore";

const unwrap = (response) => response.data?.data ?? response.data;

/**
 * @param {File} file  the X-ray
 * @param {File} [mask] segmentation mask JSON — required while automatic
 *   segmentation is unavailable
 */
export async function uploadXray(file, mask, onProgress) {
  if (USE_MOCK) return mockApi.uploadXray(file, mask);

  const form = new FormData();
  form.append("file", file);
  if (mask) form.append("mask", mask);
  return unwrap(
    await api.post("/scan/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    })
  );
}

export async function getScanStatus(scanId) {
  if (USE_MOCK) return mockApi.getScanStatus(scanId);
  return unwrap(await api.get(`/scan/${scanId}/status`));
}

export async function getScanResult(scanId) {
  if (USE_MOCK) return mockApi.getScanResult(scanId);
  return unwrap(await api.get(`/scan/${scanId}/result`));
}

export async function getScanHistory({ page = 1, limit = 10 } = {}) {
  if (USE_MOCK) return mockApi.getScanHistory();
  return unwrap(await api.get("/scan/history", { params: { page, limit } }));
}

/* ------------------------------------------------------------------ *
 * AI assistance. Each of these spends API credits, so the server caches
 * what it can and meters the rest; the client should not call them in a loop.
 * ------------------------------------------------------------------ */

/** The report rewritten for one audience. Server-cached per audience. */
export async function getReport(scanId, audience) {
  if (USE_MOCK) return mockApi.getReport(scanId, audience);
  return unwrap(await api.get(`/scan/${scanId}/report`, { params: { audience } }));
}

/**
 * The report streamed as it is written.
 *
 * Uses fetch rather than axios or EventSource: EventSource cannot send an
 * Authorization header, and axios does not expose a readable stream in the
 * browser. A 401 is retried once against a refreshed token, mirroring what the
 * axios interceptor does for every other call.
 *
 * @param {(text: string) => void} onDelta called with each piece as it arrives
 * @returns {Promise<string>} the complete markdown
 */
export async function streamReport(scanId, audience, onDelta, { signal } = {}) {
  if (USE_MOCK) {
    const { markdown } = await mockApi.getReport(scanId, audience);
    onDelta(markdown);
    return markdown;
  }

  const url = `${api.defaults.baseURL}/scan/${scanId}/report?audience=${audience}&stream=1`;

  let response = await fetch(url, { headers: authHeader(), signal });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(url, { headers: authHeader(), signal });
  }
  if (!response.ok || !response.body) {
    throw new Error(`Report stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; the tail may be a partial frame.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;

      const event = JSON.parse(line.slice(5).trim());
      if (event.type === "delta") {
        full += event.text;
        onDelta(event.text);
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }

  return full;
}

/** Ask a question about one scan. Answered only from its measurements. */
export async function askScan(scanId, question, audience) {
  if (USE_MOCK) return mockApi.askScan(scanId, question);
  return unwrap(await api.post(`/scan/${scanId}/ask`, { question, audience }));
}

/** Explain what one diagnostic overlay shows. Server-cached per condition. */
export async function explainCondition(scanId, condition, audience) {
  if (USE_MOCK) return mockApi.explainCondition(scanId, condition);
  return unwrap(
    await api.get(`/scan/${scanId}/explain/${condition}`, { params: { audience } })
  );
}

function authHeader() {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function refreshSession() {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    throw new Error("Session expired");
  }
  const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
  const payload = data.data ?? data;
  setTokens(payload.access_token, payload.refresh_token);
}
