//! Special app access (`cmd appops`) and the battery optimization exemption.
//!
//! These are the settings a user changes by hand under "special app access". Both are read
//! and applied through the plain device shell, no root needed. The op list and the modes are
//! shared with EasyAndroid (`docs/specs/EASYANDROID_INTEROP.md`).

use super::manifest::{AppOp, Manifest};
use crate::adb::Device;

const USER_OPS: &[&str] = &[
    "SYSTEM_ALERT_WINDOW",
    "WRITE_SETTINGS",
    "REQUEST_INSTALL_PACKAGES",
    "MANAGE_EXTERNAL_STORAGE",
    "GET_USAGE_STATS",
    "PICTURE_IN_PICTURE",
    "RUN_IN_BACKGROUND",
    "RUN_ANY_IN_BACKGROUND",
    "SCHEDULE_EXACT_ALARM",
    "MANAGE_MEDIA",
    "USE_FULL_SCREEN_INTENT",
    "AUTO_REVOKE_PERMISSIONS_IF_UNUSED",
];
const MODES: &[&str] = &["allow", "ignore", "deny", "default", "foreground"];

/// Only ops a user sets by hand are saved; the rest follow runtime permissions or the system.
pub fn is_user_op(op: &str, mode: &str) -> bool {
    USER_OPS.contains(&op) && MODES.contains(&mode)
}

/// Reads `cmd appops get --user 0 <package>`. The uid mode comes first and wins over the
/// package mode; ops left on `default` are not saved.
pub fn parse_app_ops(out: &str) -> Vec<AppOp> {
    let mut found: Vec<AppOp> = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        let line = line.strip_prefix("Uid mode: ").unwrap_or(line);
        let Some((op, rest)) = line.split_once(": ") else {
            continue;
        };
        let mode = rest.split(';').next().unwrap_or_default().trim();
        if is_user_op(op, mode) && mode != "default" && !found.iter().any(|o| o.op == op) {
            found.push(AppOp {
                op: op.to_string(),
                mode: mode.to_string(),
            });
        }
    }
    found
}

/// Reads `dumpsys deviceidle whitelist`: `user,<package>,<uid>` lines are the user's choices.
pub fn is_battery_exempt(out: &str, package: &str) -> bool {
    out.lines().any(|line| {
        let mut parts = line.trim().split(',');
        parts.next() == Some("user") && parts.next() == Some(package)
    })
}

/// Applies the saved ops and the battery exemption. Returns (failed, total).
pub fn restore(device: Device, manifest: &Manifest) -> (u32, u32) {
    let package = manifest.package.as_str();
    let mut failed = 0;
    let mut total = 0;
    for op in manifest
        .app_ops
        .iter()
        .filter(|o| is_user_op(&o.op, &o.mode))
    {
        total += 1;
        let set = device.shell(&[
            "cmd", "appops", "set", "--user", "0", package, &op.op, &op.mode,
        ]);
        if set.is_err() {
            failed += 1;
        }
    }
    if manifest.battery_exempt {
        total += 1;
        let plus = format!("+{package}");
        if device
            .shell(&["dumpsys", "deviceidle", "whitelist", &plus])
            .is_err()
        {
            failed += 1;
        }
    }
    (failed, total)
}

/// How many saved ops and flags a backup carries, for the restore options.
pub fn saved_count(manifest: &Manifest) -> u32 {
    manifest
        .app_ops
        .iter()
        .filter(|o| is_user_op(&o.op, &o.mode))
        .count() as u32
        + u32::from(manifest.battery_exempt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    const OPS: &str = "Uid mode: RUN_IN_BACKGROUND: allow\n\
        Uid mode: COARSE_LOCATION: allow\n\
        SYSTEM_ALERT_WINDOW: allow; time=+3d1h ago\n\
        RUN_IN_BACKGROUND: deny\n\
        GET_USAGE_STATS: default\n\
        WRITE_SETTINGS: bogus\n\
        No operations.\n";

    #[test]
    fn keeps_user_ops_with_their_first_mode() {
        let ops = parse_app_ops(OPS);
        let pairs: Vec<(&str, &str)> = ops
            .iter()
            .map(|o| (o.op.as_str(), o.mode.as_str()))
            .collect();
        assert_eq!(
            pairs,
            [
                ("RUN_IN_BACKGROUND", "allow"),
                ("SYSTEM_ALERT_WINDOW", "allow")
            ]
        );
    }

    #[test]
    fn finds_battery_exemptions_by_package() {
        let out = "system-excidle,com.android.shell,2000\nuser,com.a,10123\nuser,com.b.c,10124\n";
        assert!(is_battery_exempt(out, "com.a"));
        assert!(!is_battery_exempt(out, "com.android.shell"));
        assert!(!is_battery_exempt(out, "com.b"));
    }

    #[test]
    fn applies_only_known_ops_and_counts_failures() {
        let fake = FakeAdb::new()
            .on("set --user 0 com.a SYSTEM_ALERT_WINDOW allow", "")
            .on_fail("whitelist", "denied");
        let mut manifest = crate::features::backup::manifest::sample("com.a");
        manifest.app_ops = vec![
            AppOp {
                op: "SYSTEM_ALERT_WINDOW".into(),
                mode: "allow".into(),
            },
            AppOp {
                op: "CAMERA; reboot".into(),
                mode: "allow".into(),
            },
        ];
        manifest.battery_exempt = true;
        assert_eq!(saved_count(&manifest), 2);
        assert_eq!(restore(Device::new(&fake, "X"), &manifest), (1, 2));
        assert_eq!(fake.calls().len(), 2);
    }
}
