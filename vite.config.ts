import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";

// fitlink.rs/ugc-kreatori je zaseban HTML entry (ugc-kreatori.html) zbog
// statickog SEO/OG head-a. U produkciji tu rutu na fajl mapira vercel.json;
// u dev serveru to radi ovaj mali middleware, inace bi Vite SPA fallback
// vratio index.html i React Router bi prikazao NotFound.
const ugcEntry = (): Plugin => ({
  name: "fitlink-ugc-entry",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? "";
      if (url === "/ugc-kreatori" || url.startsWith("/ugc-kreatori?")) {
        req.url = "/ugc-kreatori.html" + url.slice("/ugc-kreatori".length);
      }
      next();
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), ugcEntry(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        "ugc-kreatori": path.resolve(__dirname, "ugc-kreatori.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
