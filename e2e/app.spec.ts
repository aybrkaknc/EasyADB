import { expect, type Page, test } from "@playwright/test";

const calls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __calls: { cmd: string }[] }).__calls.map((c) => c.cmd),
  );

test("shows the connected device and its details", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Select device" })).toContainText("Pixel 7");
  await expect(page.getByText("Device information")).toBeVisible();
  await expect(page.getByText("UQ1A.240205.002")).toBeVisible();
});

test("shows the connection guide without a device", async ({ page }) => {
  await page.goto("/?scenario=nodevice");
  await expect(page.getByText("No device connected")).toBeVisible();
  await expect(page.getByText(/Turn on USB debugging/)).toBeVisible();
});

test("guides through authorization", async ({ page }) => {
  await page.goto("/?scenario=unauthorized");
  await expect(page.getByText("Authorization needed")).toBeVisible();
});

test("switches modules with keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Device information")).toBeVisible();
  await page.keyboard.press("Control+3");
  await expect(page.getByRole("heading", { name: "Debloat", level: 1 })).toBeVisible();
  await page.keyboard.press("Control+9");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("backs up a selected app and lists it in the archive", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+2");
  await page.getByText("Spotify", { exact: true }).click();
  await expect(page.getByText("Estimated size: 23.8 MB")).toBeVisible();
  await page.getByRole("button", { name: "Back up 1 apps" }).click();
  await expect(page.getByText("1 backed up, 0 failed")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Archive" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("com.spotify.music | ")).toBeVisible();
});

test("asks before removing packages and respects cancel", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+3");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page.getByText("com.android.systemui").first().click();
  await expect(page.getByText(/bootloops the device/)).toBeVisible();

  await page
    .locator("div.cursor-pointer", { hasText: "com.android.systemui" })
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(/marked Unsafe/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await calls(page)).not.toContain("apply_debloat");
});

test("filters debloat packages by search", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+3");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page.getByPlaceholder("Search packages").fill("facebook");
  await expect(page.getByText("com.facebook.services")).toBeVisible();
  await expect(page.getByText("com.spotify.music")).toHaveCount(0);
});

test("switches the interface to Turkish", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+9");
  await page.getByRole("radio", { name: "Türkçe" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar", level: 1 })).toBeVisible();
  await expect(page.getByText("Klavye kısayolları")).toBeVisible();
});
