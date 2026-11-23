//! Single-file export/import: an uncompressed zip (`.easybckp`) of one backup folder.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Component, Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::manifest;
use crate::error::{AppError, AppResult, ErrorCode};

fn zip_err(err: zip::result::ZipError) -> AppError {
    AppError::new(ErrorCode::BackupInvalid, err.to_string())
}

/// Writes `dir` (a backup folder) into `dest` as a stored zip.
pub fn export(dir: &Path, dest: &Path) -> AppResult<()> {
    let manifest = manifest::read(dir)?;
    let id = dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::new(ErrorCode::InvalidPath, ""))?;
    let mut zip = ZipWriter::new(BufWriter::new(File::create(dest)?));
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .large_file(true);

    let mut entries = vec![manifest::MANIFEST.to_string()];
    entries.extend(manifest.files.iter().map(|f| f.stored.clone()));
    entries.extend(manifest.extras.iter().map(|f| f.stored.clone()));
    for stored in entries {
        manifest::safe_relative(&stored)?;
        zip.start_file(format!("{id}/{stored}"), options)
            .map_err(zip_err)?;
        std::io::copy(
            &mut BufReader::new(File::open(dir.join(&stored))?),
            &mut zip,
        )?;
    }
    zip.finish().map_err(zip_err)?.flush()?;
    Ok(())
}

/// Extracts an exported zip into `root`, returning the new backup folder.
pub fn import(src: &Path, root: &Path) -> AppResult<PathBuf> {
    let mut archive = ZipArchive::new(BufReader::new(File::open(src)?)).map_err(zip_err)?;
    let mut top: Option<String> = None;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(zip_err)?;
        let name = entry
            .enclosed_name()
            .ok_or_else(|| AppError::new(ErrorCode::InvalidPath, entry.name()))?;
        let first = match name.components().next() {
            Some(Component::Normal(first)) => first.to_string_lossy().into_owned(),
            _ => return Err(AppError::new(ErrorCode::InvalidPath, entry.name())),
        };
        if top.get_or_insert_with(|| first.clone()) != &first {
            return Err(AppError::new(
                ErrorCode::BackupInvalid,
                "archive contains more than one backup",
            ));
        }
    }
    let top = top.ok_or_else(|| AppError::new(ErrorCode::BackupInvalid, "empty archive"))?;

    let mut target = root.join(&top);
    let mut n = 1;
    while target.exists() {
        target = root.join(format!("{top}-{n}"));
        n += 1;
    }
    let result = (|| -> AppResult<()> {
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(zip_err)?;
            let name = entry.enclosed_name().unwrap_or_default();
            let relative: PathBuf = name.components().skip(1).collect();
            let out = target.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&out)?;
                continue;
            }
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            std::io::copy(&mut entry, &mut BufWriter::new(File::create(&out)?))?;
        }
        manifest::read(&target).map(|_| ())
    })();
    match result {
        Ok(()) => Ok(target),
        Err(err) => {
            let _ = fs::remove_dir_all(&target);
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_import_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("com.a_20260101-000000");
        fs::create_dir_all(dir.join("apk")).unwrap();
        fs::write(dir.join("apk/base.apk"), b"abc").unwrap();
        manifest::write(&dir, &manifest::sample("com.a")).unwrap();

        let file = tmp.path().join("x.easybckp");
        export(&dir, &file).unwrap();

        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();
        let first = import(&file, &root).unwrap();
        let second = import(&file, &root).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(first.join("apk/base.apk")).unwrap(), b"abc");
    }

    #[test]
    fn rejects_archives_without_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("bad.easybckp");
        let mut zip = ZipWriter::new(File::create(&file).unwrap());
        zip.start_file("x/readme.txt", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"hi").unwrap();
        zip.finish().unwrap();
        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            import(&file, &root).unwrap_err().code,
            ErrorCode::BackupInvalid
        );
        assert!(!root.join("x").exists());
    }
}
