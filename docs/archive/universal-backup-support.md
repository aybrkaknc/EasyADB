# Task: Universal Backup (Split APK & OBB Support)

## Goal
Enhance the Backup & Restore module to support modern Android app structures, specifically Split APKs (App Bundles) and OBB expansion files. This ensures high compatibility with device ecosystems like HyperOS, OneUI, and AOSP.

## Status
- [x] Phase 1: Logic Design (Rust)
- [x] Phase 2: Split APK & OBB Detection
- [x] Phase 3: Update Backup Routine
- [x] Phase 4: Update Restore Routine (Install-Multiple)
- [x] Phase 5: Verification

## Technical Changes

### 1. Backend (`src-tauri/src/adb.rs`)

#### `backup_package`
- **Current:** Pulls single file from `package.path`.
- **New:**
    1.  Determine parent directory of `package.path`.
    2.  List all `.apk` files in that directory.
    3.  Pull all found APKs into a temporary `apks/` folder.
    4.  Check `/sdcard/Android/obb/<package_name>` existence.
    5.  If exists, pull to `obb/` folder.
    6.  Update `metadata.json` to include `isSplit: true` and `hasObb: true`.
    7.  Zip everything.

#### `restore_package`
- **Current:** Unzips and runs `adb install -r base.apk`.
- **New:**
    1.  Unzip.
    2.  Read `metadata.json` (optional, can just check folder structure).
    3.  If `apks/` contains multiple files:
        - Construct command `adb install-multiple -r apks/file1.apk apks/file2.apk ...`
    4.  If single file:
        - `adb install -r apks/base.apk`
    5.  If `obb/` exists:
        - `adb push obb/* /sdcard/Android/obb/<package_name>/`

### 2. File Structure (.easybckp)
Old:
- `base.apk`
- `metadata.json`

New:
- `apks/`
    - `base.apk`
    - `split_config.arm64.apk` (if any)
- `obb/` (optional)
    - `main.123.com.example.obb`
- `metadata.json`

## User Review Required
- **Backup Size:** Backups will be significantly larger if OBB is included. 
- **Time:** Operations will take longer. Progress bars (Phase 3 of enhanced UI) will be crucial here.
