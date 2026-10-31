import { test, expect } from "@playwright/test";
test("production PWA: manifest, полный precache, офлайн reload и игра", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.PWA_TEST,
    "Требуется production preview: PWA_TEST=1 APP_URL=...",
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const data = await page.evaluate(async () => {
    const manifest = await (await fetch("manifest.webmanifest")).json();
    const cachesInfo = await Promise.all(
      (await caches.keys()).map(async (key) => ({
        key,
        urls: (await (await caches.open(key)).keys()).map((x) => x.url),
      })),
    );
    return { manifest, cachesInfo };
  });
  expect(data.manifest.display).toBe("standalone");
  expect(data.manifest.start_url).toBe("/absurd-os/");
  const urls = data.cachesInfo.flatMap((x) => x.urls);
  for (const file of [
    "index.html",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "offline.html",
  ])
    expect(urls.some((u) => u.includes(file))).toBe(true);
  expect(urls.some((u) => /assets\/index-.*\.js/.test(u))).toBe(true);
  expect(urls.some((u) => /assets\/index-.*\.css/.test(u))).toBe(true);
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  expect(installability.installabilityErrors).toEqual([]);
  await cdp.detach();
  await page
    .getByRole("button", { name: "Запустить хаос", exact: true })
    .click();
  const chaos = await page.getByTestId("chaos-value").textContent();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Реальность под контролем." }),
  ).toBeVisible();
  await expect(page.getByTestId("chaos-value")).toHaveText(chaos);
  await expect(
    page.getByText("Автономный режим.", { exact: false }),
  ).toBeVisible();
  await page
    .locator("#controls")
    .getByRole("button", { name: "Оракул", exact: true })
    .click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(2);
  await page.getByRole('link',{name:'Борис',exact:true}).click();
  await page.getByLabel('Сообщение Борису',{exact:true}).fill('Что с гравитацией без интернета?');
  await page.getByRole('button',{name:'Отправить сообщение'}).click();
  await expect(page.locator('[data-role=boris]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-role=boris]')).toHaveCount(1);
  await expect(page.getByTestId('boris-mode')).toContainText('Автономный');
  await page.getByRole('button',{name:'Провести эксперимент',exact:true}).click();
  await page.getByRole('button',{name:'Да, запускаем'}).click();
  await expect(page.getByTestId('experiment-result')).toBeVisible();
  await page.getByRole('link',{name:'Архив',exact:false}).click();
  await expect(page.getByTestId('archive-entry')).toHaveCount(3);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
test("production PWA: после очистки CacheStorage и удаления SW кэш создаётся заново", async ({
  page,
}) => {
  test.skip(!process.env.PWA_TEST, "Требуется production preview");
  await page.goto("./");
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations())
      await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toEqual([]);
});
