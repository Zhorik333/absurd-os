import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});
test("панель, все действия, архив, сохранение, отчёт и настройки", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "Реальность под контролем." }),
  ).toBeVisible();
  for (const name of [
    "Запустить хаос",
    "Оракул",
    "Вызвать инопланетян",
    "Напечатать деньги",
    "Отключить гравитацию",
    "Вызвать кофейного бога",
  ])
    await page
      .locator("#controls")
      .getByRole("button", { name, exact: true })
      .click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(6);
  const chaos = await page.getByTestId("chaos-value").textContent();
  await page.reload();
  await expect(page.getByTestId("archive-entry")).toHaveCount(6);
  await expect(page.getByTestId("chaos-value")).toHaveText(chaos);
  await page
    .getByRole("button", { name: "Отчёт директору", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("ДИАГНОЗ");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Скопировать отчёт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Отчёт скопирован" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "АБСУРД OS",
  );
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Звуковые эффекты").check();
  await page.getByLabel("Интенсивные эффекты").uncheck();
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("Звуковые эффекты")).toBeChecked();
  await expect(page.getByLabel("Интенсивные эффекты")).not.toBeChecked();
  expect(errors).toEqual([]);
});
test("100%, перезапуск, очистка архива, мобильная ширина", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .getByRole("button", { name: "Перезапустить вселенную", exact: true })
        .isVisible()
    )
      break;
    await page
      .getByRole("button", { name: "Запустить хаос", exact: true })
      .click();
  }
  await expect(page.getByTestId("chaos-value")).toHaveText("100");
  await page
    .getByRole("button", { name: "Перезапустить вселенную", exact: true })
    .click();
  await expect(page.getByTestId("chaos-value")).toHaveText("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Очистить архив", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, уничтожить записи" }).click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(0);
});
test("доступность клавиатуры и повреждённое хранилище", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("absurd-os:universe:v1", "{broken");
  });
  await page.reload();
  await expect(page.getByTestId("chaos-value")).toHaveText("0");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
