import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const repository = env.GITHUB_REPOSITORY?.split("/")[1];
  const requestedBase =
    env.VITE_BASE_PATH || (repository ? `/${repository}/` : "/absurd-os/");
  const base = `/${requestedBase.split("/").filter(Boolean).join("/")}${requestedBase === "/" ? "" : "/"}`;
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        strategies: "generateSW",
        registerType: "prompt",
        injectRegister: false,
        scope: base,
        base,
        includeAssets: ["favicon.svg", "icons/*.png", "offline.html"],
        manifest: {
          id: base,
          name: "АБСУРД OS™ — Бюро абсурдных ситуаций",
          short_name: "АБСУРД OS™",
          description:
            "Бюро абсурдных ситуаций. Интерактивный симулятор необязательных катастроф.",
          lang: "ru",
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#090b16",
          theme_color: "#090b16",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/maskable-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: [
            "**/*.{js,css,html,png,svg,ico,webmanifest,woff,woff2}",
          ],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: true,
          navigateFallback: `${base}index.html`,
          navigateFallbackAllowlist: [
            new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
