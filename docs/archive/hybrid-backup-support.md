# Task: Hybrid Backup (Root Support)

## Goal
Implement "Hybrid Mode" for backup and restore operations. This mode auto-detects if a device is rooted and, if so, backs up and restores the `/data/data/<package>` directory (application data, settings, login info) in addition to the APKs and OBBs.

## Status
- [x] Phase 1: Root Detection Logic Check
- [x] Phase 2: Implement Root Backup Strategy (tar czf)
- [x] Phase 3: Implement Root Restore Strategy (tar xzf + restorecon/chmod)
- [x] Phase 4: Integration with Universal Backup
- [x] Phase 5: Verification

## Technical Changes

### 1. Root Backup Strategy (`adb.rs`)
Inside `backup_package`:
1.  Check `device_info.is_rooted` (already implemented via `which su`).
2.  If Rooted:
    - Create `temp/data/` directory.
    - Run: `adb shell "su -c 'tar -czf - /data/data/<package_name>'" > temp/data/data.tar.gz`
    - Or stream directly if possible, or save to `/sdcard/` temp and pull. 
    - **Safe Method:** 
        1. `su -c "tar czf /sdcard/easyadb_data.tar.gz -C /data/data <package_name>"` (Change dir to avoid full path structure issues)
        2. `adb pull /sdcard/easyadb_data.tar.gz temp/data/data.tar.gz`
        3. `adb shell rm /sdcard/easyadb_data.tar.gz`
3.  Update `metadata.json`: `hasData: true`.
4.  Add `data.tar.gz` to the final `.easybckp`.

### 2. Root Restore Strategy (`adb.rs`)
Inside `restore_package`:
1.  Check if `data.tar.gz` or `data/` exists in backup.
2.  Check if device is rooted.
3.  If BOTH true:
    - Push `data.tar.gz` to `/sdcard/easyadb_data.tar.gz`.
    - Run: `adb shell "su -c 'tar xzf /sdcard/easyadb_data.tar.gz -C /data/data'"`
    - **Critical:** Fix permissions. `su -c 'chown -R <uid>:<gid> /data/data/<package_name>'`.
        - How to get UID? `dumpsys package <package_name> | grep userId`
    - **Critical:** Fix SELinux context. `su -c 'restorecon -R /data/data/<package_name>'`
    - Cleanup `/sdcard/easyadb_data.tar.gz`.

## User Review Required
- **Permissions:** "Hybrid Mode" backup requires the user to grant Root permission on the phone screen (Magisk/KernelSU prompt) during the process. We should warn/instruct the user in the UI log.
