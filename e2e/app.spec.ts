import { expect, type Page, test } from "@playwright/test";

const calls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __calls: { cmd: string }[] }).__calls.map((c) => c.cmd),
  );

/** Opens a module from the icon rail. Clicking waits for the app to be ready, unlike a shortcut. */
const openModule = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Modules" }).getByRole("button", { name }).click();

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
  await openModule(page, "Backup");
  await page.getByText("Spotify", { exact: true }).click();
  await expect(page.getByText("Estimated size: 23.8 MB")).toBeVisible();
  await page.getByRole("button", { name: "Back up 1 apps" }).click();
  await expect(page.getByRole("dialog").getByText("Completed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("tab", { name: "Restore" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("com.spotify.music | ")).toBeVisible();
});

test("protected packages cannot be disabled or removed", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Debloat");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page.getByText("com.android.systemui").first().click();
  await expect(page.getByText(/bootloops the device/)).toBeVisible();
  await expect(page.getByText(/Protected: this package cannot be disabled/)).toBeVisible();

  const row = page.locator("div.cursor-pointer", { hasText: "com.android.systemui" });
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);
});

test("asks before removing packages and respects cancel", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Debloat");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page
    .locator("div.cursor-pointer", { hasText: "com.facebook.services" })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await calls(page)).not.toContain("apply_debloat");
});

test("filters debloat packages by search", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Debloat");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page.getByPlaceholder("Search packages").fill("facebook");
  await expect(page.getByText("com.facebook.services")).toBeVisible();
  await expect(page.getByText("com.spotify.music")).toHaveCount(0);
});

test("switches the interface to Turkish", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("radio", { name: "Türkçe" }).click();
  await expect(page.getByRole("heading", { name: "Ayarlar", level: 1 })).toBeVisible();
  await expect(page.getByText("Klavye kısayolları")).toBeVisible();
});

test("does not offer app data without root", async ({ page }) => {
  await page.goto("/?scenario=noroot");
  await openModule(page, "Backup");
  await expect(page.getByText(/No root, or root was denied/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Include app data/ })).toBeDisabled();
});

test("offers app data when root is available", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Backup");
  await expect(page.getByText("Root available: app data can be copied.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Include app data/ })).toBeEnabled();
});

test("dims removed apps and enables only fitting actions", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Debloat");
  await page.getByRole("radio", { name: /All/ }).first().click();

  const removed = page.locator("div.cursor-pointer", { hasText: "Old Removed" });
  await expect(removed.locator(".opacity-40")).toHaveCount(1);
  await expect(removed.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await expect(removed.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);

  const disabled = page.locator("div.cursor-pointer", { hasText: "Old Disabled" });
  await expect(disabled.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
  await expect(disabled.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);

  await removed.getByRole("checkbox").click();
  // The bulk buttons come before the list in the DOM, so the first match is the toolbar.
  await expect(page.getByRole("button", { name: "Restore", exact: true }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: "Disable", exact: true }).first()).toBeDisabled();
});

test("opens a web search for the selected app", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Debloat");
  await page.getByRole("radio", { name: /All/ }).first().click();
  await page.getByText("com.android.systemui").first().click();
  await page.getByRole("button", { name: "Search the web" }).click();
  await expect.poll(() => calls(page)).toContain("open_web_search");
});

test("offers to copy phone backups and warns about root", async ({ page }) => {
  await page.goto("/?scenario=phonebackups");
  await expect(page.getByText("Backups found on the phone")).toBeVisible();
  await expect(page.getByText("Old App")).toBeVisible();
  await expect(page.getByText(/Allow root for the shell/)).toBeVisible();
  await page.getByRole("button", { name: "Copy to PC" }).click();
  await expect.poll(() => calls(page)).toContain("pull_phone_backups");
  await expect(page.getByText("Backups found on the phone")).toHaveCount(0);
});

test("restores a system settings snapshot", async ({ page }) => {
  await page.goto("/?scenario=systembackup");
  await openModule(page, "Backup");
  await page.getByRole("tab", { name: "Restore" }).click();
  await expect(page.getByText("System settings")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Restore system settings")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => calls(page)).toContain("restore_system_backup");
  await expect(page.getByText("Completed with warnings")).toBeVisible();
  await expect(page.getByText("global/private_dns_mode")).toBeVisible();
});

test("stays quiet when the phone has no backups", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Device/ }).first()).toBeVisible();
  await expect(page.getByText("Backups found on the phone")).toHaveCount(0);
});

test("asks whether to restore saved permissions", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Backup");
  await page.getByText("Spotify", { exact: true }).click();
  await page.getByRole("button", { name: "Back up 1 apps" }).click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("com.spotify.music | ")).toBeVisible();

  await page.getByRole("button", { name: "Restore", exact: true }).click();
  const permissions = page.getByRole("checkbox", { name: /saved permissions \(3\)/ });
  await expect(permissions).toBeChecked();
  await permissions.click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
  await expect.poll(() => calls(page)).toContain("start_restore");
  const restore = await page.evaluate(
    () =>
      (
        window as unknown as { __calls: { cmd: string; args: { options: unknown } }[] }
      ).__calls.find((c) => c.cmd === "start_restore")?.args.options,
  );
  expect(restore).toMatchObject({ restorePermissions: false });
});

test("asks about a phone's backup, follows it and shows how it ended", async ({ page }) => {
  await page.goto("/?scenario=phonerequest");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("The phone Pixel 7 asks for a backup")).toBeVisible();
  await expect(dialog.getByText(/Closes by itself in 1:5\d|2:00/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("The phone Pixel 7 asks for a backup")).toBeVisible();
  await dialog.getByRole("button", { name: "This time only" }).click();
  await expect(dialog.getByText("App backup")).toBeVisible();
  await expect(dialog.getByText("1 / 2")).toBeVisible();
  await expect(dialog.getByText("Completed with warnings")).toBeVisible();
  await expect(dialog.getByText("App data was not backed up.")).toBeVisible();
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toHaveCount(0);
});

test("measures the speed from the wireless module", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Wireless");
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("21.0 MB/s (168 Mbit/s)")).toBeVisible();
});
