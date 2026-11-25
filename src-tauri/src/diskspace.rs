//! Free space on the PC drive that holds a folder.

use std::path::Path;

use crate::error::{AppError, AppResult, ErrorCode};

/// Space that is always left free, so that a backup never fills the drive.
const RESERVE: u64 = 512 * 1024 * 1024;

#[cfg(windows)]
pub fn free_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;

    unsafe extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut available = 0u64;
    // SAFETY: `wide` is NUL terminated and the out pointers are valid or null, as the API allows.
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(available)
}

#[cfg(not(windows))]
pub fn free_bytes(_path: &Path) -> Option<u64> {
    None
}

/// Fails when `needed` bytes plus a reserve do not fit. An unknown free space passes.
pub fn ensure(path: &Path, needed: u64) -> AppResult<()> {
    match free_bytes(path) {
        Some(free) if free < needed.saturating_add(RESERVE) => {
            Err(AppError::new(ErrorCode::NoSpace, needed.to_string()))
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_the_free_space_of_an_existing_folder() {
        let dir = tempfile::tempdir().unwrap();
        #[cfg(windows)]
        assert!(free_bytes(dir.path()).unwrap() > 0);
        assert!(ensure(dir.path(), 1).is_ok());
        #[cfg(windows)]
        assert_eq!(
            ensure(dir.path(), u64::MAX).unwrap_err().code,
            ErrorCode::NoSpace
        );
    }
}
