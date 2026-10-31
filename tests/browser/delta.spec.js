import { test, expect } from "@playwright/test";
test("кофе показывает отрицательную дельту без двойного знака", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page
    .getByRole("button", { name: "Вызвать кофейного бога", exact: true })
    .click();
  await expect(page.locator(".event-delta")).toHaveText(/^-\d+%ХАОСА$/);
  await expect(page.locator(".archive-delta")).toHaveText(/^-\d+%$/);
});
