// Infrastructure smoke check. If UI is not yet present, use a clearly labelled
// virtual entry; never replace project source or present this as a UI test.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { build } from "vite";
import config from "../vite.config.js";

const originalRepo = process.env.GITHUB_REPOSITORY;
const originalBase = process.env.VITE_BASE_PATH;
for (const [repository, override, expected] of [
  ["", "", "/absurd-os/"],
  ["Zhorik333/absurd-os", "", "/absurd-os/"],
  ["someone/another-repo", "", "/another-repo/"],
  ["", "/", "/"],
  ["someone/repo", "custom-path", "/custom-path/"],
]) {
  process.env.GITHUB_REPOSITORY = repository;
  process.env.VITE_BASE_PATH = override;
  assert.equal(config({ mode: "production" }).base, expected);
}
if (originalRepo === undefined) delete process.env.GITHUB_REPOSITORY;
else process.env.GITHUB_REPOSITORY = originalRepo;
if (originalBase === undefined) delete process.env.VITE_BASE_PATH;
else process.env.VITE_BASE_PATH = originalBase;

const outDir = resolve(".pwa-smoke-dist");
const fixture = !existsSync("src/main.jsx");
try {
  await build({
    build: { outDir, emptyOutDir: true },
    plugins: fixture
      ? [
          {
            name: "pwa-infrastructure-only-fixture",
            enforce: "pre",
            resolveId(id) {
              if (id === "/src/main.jsx") return "\0pwa-smoke-entry";
            },
            load(id) {
              if (id === "\0pwa-smoke-entry")
                return 'import { usePwa } from "/src/pwa.js"; window.__pwaSmokeHook = usePwa;';
            },
          },
        ]
      : [],
  });
  const manifest = JSON.parse(
    readFileSync(join(outDir, "manifest.webmanifest"), "utf8"),
  );
  const base = config({ mode: "production" }).base;
  assert.equal(manifest.scope, base);
  assert.equal(manifest.start_url, base);
  assert.equal(manifest.id, base);
  assert.equal(manifest.icons.length, 4);
  const worker = readFileSync(join(outDir, "sw.js"), "utf8");
  const files = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    );
  for (const file of files(outDir)) {
    const name = relative(outDir, file).replaceAll("\\", "/");
    if (/^(sw\.js|workbox-.*\.js)$/.test(name)) continue;
    if (/\.(js|css|html|png|svg|webmanifest)$/.test(name)) {
      assert.ok(worker.includes(name), `Missing precache entry: ${name}`);
    }
  }
  assert.match(
    worker,
    /addEventListener\("message",[^}]*"SKIP_WAITING"[^}]*self\.skipWaiting\(\)/,
    "Activation must be gated behind the explicit update message",
  );
  assert.equal(
    (worker.match(/self\.skipWaiting\(\)/g) || []).length,
    1,
    "No unconditional update activation",
  );
  assert.ok(
    worker.includes("SKIP_WAITING"),
    "Explicit update activation must be supported",
  );
  assert.ok(
    readFileSync(join(outDir, "offline.html"), "utf8").includes('href="./"'),
  );
  console.log(
    `PWA build checks passed (${fixture ? "virtual entry; UI not yet present" : "real UI entry"}).`,
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
