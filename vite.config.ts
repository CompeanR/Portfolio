import { defineConfig } from "vite";

const allowedHosts = ["mac-mini", "mac-mini.local"];

export default defineConfig({
  server: { allowedHosts },
  preview: { allowedHosts },
});
