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

test("backs up a selected app and lists it in the archive", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Backup");
  await page.getByText("Spotify", { exact: true }).click();
  await expect(page.getByText("Estimated size: 23.8 MB")).toBeVisible();
  await page.getByRole("button", { name: "Back up 1 apps" }).click();
  await expect(page.getByRole("dialog").getByText("Backup completed")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Uygulama" })).toBeVisible();
});

test("does not offer app data without root", async ({ page }) => {
  await page.goto("/?scenario=noroot");
  await openModule(page, "Backup");
  await expect(page.getByText(/No root, or root was denied/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Data/ })).toBeDisabled();
});

test("offers app data when root is available", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Backup");
  await expect(page.getByText("Root available: app data can be copied.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Data/ })).toBeEnabled();
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
  await expect(page.getByText("Backups found on the phone")).toHaveCount(0);
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.getByRole("menuitem", { name: /Backups found on the phone/ }).click();
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
  await expect(page.getByRole("heading", { name: /Home/ }).first()).toBeVisible();
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
  await expect(dialog.getByText("Backing up...")).toBeVisible();
  await expect(dialog.getByText("1 / 2")).toBeVisible();
  await expect(dialog.getByText("Backup completed with warnings")).toBeVisible();
  await expect(dialog.getByText("2 / 2 apps backed up")).toBeVisible();
  await expect(dialog.getByText("App data was not backed up.")).toBeVisible();
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toHaveCount(0);
});

/** The arguments the app sent with a command. */
const argsOf = (page: Page, command: string) =>
  page.evaluate(
    (name) =>
      (window as unknown as { __calls: { cmd: string; args: unknown }[] }).__calls
        .filter((c) => c.cmd === name)
        .map((c) => c.args),
    command,
  );

test("measures the speed of a connection", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("21.0 MB/s (168 Mbit/s)")).toBeVisible();
});

/** Opens the debugging tab of the settings. */
const openDebugging = async (page: Page) => {
  await openModule(page, "Settings");
  await page.getByRole("tab", { name: "Debugging" }).click();
};

const debugSection = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Debugging sections" })
    .getByRole("button", { name, exact: true })
    .click();

test("does not wait for a code while a phone is connected", async ({ page }) => {
  await page.goto("/?scenario=wireless");
  await openDebugging(page);
  await expect(page.getByText("Pixel 7 is already connected.", { exact: false })).toBeVisible();
  expect(await calls(page)).not.toContain("wireless_new_qr");
  await page.getByRole("button", { name: "Show QR code" }).click();
  await expect(page.getByText("Waiting for a new phone to scan the code")).toBeVisible();
});

test("says which new phone a code connected", async ({ page }) => {
  await page.goto("/?scenario=scan");
  await openDebugging(page);
  await debugSection(page, "Wireless");
  await expect(page.getByText("Pixel 9 connected.")).toBeVisible();
});

test("changes a setting of the phone and asks before revoking", async ({ page }) => {
  await page.goto("/");
  await openDebugging(page);
  await debugSection(page, "Phone");
  await page.getByRole("switch", { name: "Keep the screen on while charging" }).click();
  await expect(page.getByText("Setting changed on the phone")).toBeVisible();
  expect(await argsOf(page, "set_debug_setting")).toEqual([
    { serial: "R58M123", setting: { kind: "stay_awake", value: true } },
  ]);
  await page.getByRole("button", { name: "Revoke all PC authorizations" }).click();
  await expect(page.getByRole("dialog")).toContainText("This cannot be undone.");
  expect(await calls(page)).not.toContain("revoke_authorizations");
});

test("starts every visit at the first settings section", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await expect(page.getByText("Verify SHA-256", { exact: false })).toBeVisible();
  await openModule(page, "Home");
  await openModule(page, "Settings");
  await expect(page.getByRole("button", { name: "Application" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("turns automatic connection off", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("switch", { name: /Connect paired phones/ }).click();
  await expect
    .poll(() => argsOf(page, "save_settings"))
    .toMatchObject([{ settings: { autoConnect: false } }]);
});

test("opens the debugging tab from the connection guide", async ({ page }) => {
  await page.goto("/?scenario=nodevice");
  await page.getByRole("button", { name: "Open debug connection" }).click();
  await expect(page.getByRole("tab", { name: "Debugging" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("keeps the terminal while another tab is open", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("tab", { name: "Terminal" }).click();
  const input = page.getByRole("textbox", { name: /adb/ });
  await input.fill("adb devices");
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("tab", { name: "Terminal" }).click();
  await expect(input).toHaveValue("adb devices");
});

test("opens the tools inside the settings", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("tab", { name: "Logcat" }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await openModule(page, "Home");
  await openModule(page, "Settings");
  await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
});

test("opens and closes the module rail from the corner", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Modules" });
  await expect(rail.getByText("Backup", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand menu" }).click();
  await expect(rail.getByText("Backup", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse menu" }).click();
  await expect(rail.getByText("Backup", { exact: true })).toHaveCount(0);
});

test("runs a terminal command typed on the prompt line", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Settings");
  await page.getByRole("tab", { name: "Terminal" }).click();
  await page.getByRole("textbox", { name: /adb/ }).fill("devices");
  await page.keyboard.press("Enter");
  await expect(page.getByText("R58M123 $ devices")).toBeVisible();
});

test("uploads files picked from several folders and refuses the same name twice", async ({
  page,
}) => {
  await page.goto("/");
  await openModule(page, "Files");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("desktop.ini")).toHaveCount(0);
  await dialog.getByText("movie.zip").click();
  await dialog.getByText("album", { exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "PC folder" })).toHaveValue(/album$/);
  await expect(dialog.getByText("desktop.ini")).toHaveCount(0);
  await expect(dialog.getByText("movie.zip")).toHaveCount(2);
  await dialog.getByText("movie.zip").first().click();
  await expect(dialog.getByRole("alert")).toContainText("movie.zip");
  await expect(dialog.getByText("Selected (1)")).toBeVisible();
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(/1 items transferred/)).toBeVisible();
  expect(await calls(page)).toContain("push_paths");
});

test("downloads to a folder picked in the app, from the right-click menu", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Files");
  await page.getByText("notes.txt").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Download" }).click();
  await page.getByRole("button", { name: "Download here" }).click();
  await expect(page.getByText(/1 items transferred/)).toBeVisible();
  expect(await calls(page)).toContain("pull_paths");
});

test("filters the phone folder by name", async ({ page }) => {
  await page.goto("/");
  await openModule(page, "Files");
  await page.getByRole("button", { name: "Search this folder" }).click();
  await page.getByRole("textbox", { name: "Search this folder" }).fill("note");
  await expect(page.getByText("notes.txt")).toBeVisible();
  await expect(page.getByText("Download", { exact: true })).toHaveCount(0);
});
