// Real two-version Service Worker test, without modifying the build on disk.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = resolve("dist");
let version = 1;
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/absurd-os/")) {
      res.writeHead(404).end();
      return;
    }
    let file = resolve(
      root,
      pathname.slice("/absurd-os/".length) || "index.html",
    );
    if (!file.startsWith(root + "/")) {
      res.writeHead(403).end();
      return;
    }
    let data = await readFile(file);
    if (file.endsWith("/sw.js"))
      data = Buffer.concat([
        data,
        Buffer.from(`\n// Real update verification version ${version}\n`),
      ]);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/absurd-os/`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page
    .getByRole("button", { name: "Запустить хаос", exact: true })
    .click();
  const before = await page.getByTestId("chaos-value").textContent();
  version = 2;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.getByRole("button", { name: "Обновить систему" }).waitFor();
  const waiting = await page.evaluate(
    async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
  );
  assert.equal(waiting, true);
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Обновить систему" }).click(),
  ]);
  await page.getByTestId("chaos-value").waitFor();
  assert.equal(await page.getByTestId("chaos-value").textContent(), before);
  assert.equal(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    ),
    false,
  );
  console.log(
    "PASS: new worker waits → update banner → explicit approval → reload → chaos preserved.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
