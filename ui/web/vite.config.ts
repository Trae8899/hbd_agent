import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/palette": "http://localhost:8000",
      "/simulate": "http://localhost:8000",
      "/optimize": "http://localhost:8000",
      "/examples": "http://localhost:8000"
    }
  }
});
