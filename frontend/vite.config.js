import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // strictPort: fail instead of silently moving to 5174, which would land the
  // app on an origin the backend's CORS allowlist does not know about.
  server: { port: 5173, strictPort: true },
});
