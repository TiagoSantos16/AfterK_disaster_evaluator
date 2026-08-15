import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  base: "./",
  envDir: "..",
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl-worker.mjs', 'maplibre-gl']
  },
});
