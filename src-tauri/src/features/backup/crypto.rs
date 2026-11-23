//! Optional backup encryption: Argon2id key derivation and chunked AES-256-GCM.
//!
//! Stream format: `EADB1` magic, 8-byte random nonce prefix, then frames of
//! `[u32 LE ciphertext length][ciphertext]`. Each 1 MiB chunk uses nonce
//! `prefix || counter` and AAD `counter || last-flag`, so reordering,
//! truncation and appending are all detected.

use std::io::{Read, Write};

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::{AppError, AppResult, ErrorCode};

const MAGIC: &[u8; 5] = b"EADB1";
const CHUNK: usize = 1 << 20;
const CHECK_PLAINTEXT: &[u8] = b"easyadb-password-check";

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionInfo {
    pub algorithm: String,
    pub kdf: String,
    pub salt: String,
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    /// Encrypted known value used to reject a wrong password before restoring.
    pub check: String,
}

pub struct Key([u8; 32]);

fn crypto_err(detail: impl Into<String>) -> AppError {
    AppError::new(ErrorCode::Internal, detail)
}

fn random<const N: usize>() -> AppResult<[u8; N]> {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).map_err(|e| crypto_err(e.to_string()))?;
    Ok(buf)
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn from_hex(text: &str) -> AppResult<Vec<u8>> {
    if text.len() % 2 != 0 {
        return Err(AppError::new(ErrorCode::BackupInvalid, "odd hex length"));
    }
    (0..text.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&text[i..i + 2], 16)
                .map_err(|_| AppError::new(ErrorCode::BackupInvalid, "invalid hex"))
        })
        .collect()
}

fn derive(
    password: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> AppResult<Key> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(32))
        .map_err(|e| crypto_err(e.to_string()))?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| crypto_err(e.to_string()))?;
    Ok(Key(key))
}

/// Creates a fresh key and the manifest metadata needed to re-derive it.
pub fn new_key(password: &str) -> AppResult<(Key, EncryptionInfo)> {
    let salt = random::<16>()?;
    let (memory_kib, iterations, parallelism) = (64 * 1024, 3, 1);
    let key = derive(password, &salt, memory_kib, iterations, parallelism)?;
    let mut check = Vec::new();
    encrypt_stream(&key, CHECK_PLAINTEXT, &mut check)?;
    let info = EncryptionInfo {
        algorithm: "aes-256-gcm-chunked".into(),
        kdf: "argon2id".into(),
        salt: to_hex(&salt),
        memory_kib,
        iterations,
        parallelism,
        check: to_hex(&check),
    };
    Ok((key, info))
}

/// Re-derives the key and verifies it against the stored check value.
pub fn open_key(password: &str, info: &EncryptionInfo) -> AppResult<Key> {
    let key = derive(
        password,
        &from_hex(&info.salt)?,
        info.memory_kib,
        info.iterations,
        info.parallelism,
    )?;
    let mut plain = Vec::new();
    match decrypt_stream(&key, from_hex(&info.check)?.as_slice(), &mut plain) {
        Ok(_) if plain == CHECK_PLAINTEXT => Ok(key),
        _ => Err(AppError::new(ErrorCode::WrongPassword, "")),
    }
}

fn cipher(key: &Key) -> AppResult<Aes256Gcm> {
    Aes256Gcm::new_from_slice(&key.0).map_err(|e| crypto_err(e.to_string()))
}

fn nonce_for(prefix: &[u8; 8], counter: u32) -> Nonce<aes_gcm::aead::consts::U12> {
    let mut bytes = [0u8; 12];
    bytes[..8].copy_from_slice(prefix);
    bytes[8..].copy_from_slice(&counter.to_le_bytes());
    bytes.into()
}

fn aad(counter: u32, last: bool) -> [u8; 5] {
    let mut out = [0u8; 5];
    out[..4].copy_from_slice(&counter.to_le_bytes());
    out[4] = last as u8;
    out
}

/// Reads until `buf` is full or EOF; returns the number of bytes read.
fn read_full(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    Ok(filled)
}

/// Encrypts everything from `reader` into `writer`. Returns plaintext bytes processed.
pub fn encrypt_stream(key: &Key, mut reader: impl Read, mut writer: impl Write) -> AppResult<u64> {
    let cipher = cipher(key)?;
    let prefix = random::<8>()?;
    writer.write_all(MAGIC)?;
    writer.write_all(&prefix)?;

    let mut current = vec![0u8; CHUNK];
    let mut next = vec![0u8; CHUNK];
    let mut len = read_full(&mut reader, &mut current)?;
    let (mut counter, mut total) = (0u32, 0u64);
    loop {
        let next_len = if len == CHUNK {
            read_full(&mut reader, &mut next)?
        } else {
            0
        };
        let last = next_len == 0;
        let aad = aad(counter, last);
        let sealed = cipher
            .encrypt(
                &nonce_for(&prefix, counter),
                Payload {
                    msg: &current[..len],
                    aad: &aad,
                },
            )
            .map_err(|_| crypto_err("encryption failed"))?;
        writer.write_all(&(sealed.len() as u32).to_le_bytes())?;
        writer.write_all(&sealed)?;
        total += len as u64;
        if last {
            return Ok(total);
        }
        std::mem::swap(&mut current, &mut next);
        len = next_len;
        counter = counter
            .checked_add(1)
            .ok_or_else(|| crypto_err("stream too long"))?;
    }
}

/// Decrypts a stream written by [`encrypt_stream`]. Returns plaintext bytes written.
pub fn decrypt_stream(key: &Key, mut reader: impl Read, mut writer: impl Write) -> AppResult<u64> {
    let invalid = || {
        AppError::new(
            ErrorCode::IntegrityFailed,
            "encrypted file is corrupt or was modified",
        )
    };
    let cipher = cipher(key)?;
    let mut header = [0u8; 13];
    reader.read_exact(&mut header).map_err(|_| invalid())?;
    if &header[..5] != MAGIC {
        return Err(invalid());
    }
    let prefix: [u8; 8] = header[5..].try_into().unwrap();

    let (mut counter, mut total) = (0u32, 0u64);
    let mut frame = Vec::with_capacity(CHUNK + 16);
    loop {
        let mut len_buf = [0u8; 4];
        reader.read_exact(&mut len_buf).map_err(|_| invalid())?;
        let len = u32::from_le_bytes(len_buf) as usize;
        if len > CHUNK + 16 {
            return Err(invalid());
        }
        frame.resize(len, 0);
        reader.read_exact(&mut frame).map_err(|_| invalid())?;

        // Try as a middle chunk first, then as the final one.
        let nonce = nonce_for(&prefix, counter);
        let (plain, last) = match cipher.decrypt(
            &nonce,
            Payload {
                msg: &frame,
                aad: &aad(counter, false),
            },
        ) {
            Ok(plain) => (plain, false),
            Err(_) => {
                let plain = cipher
                    .decrypt(
                        &nonce,
                        Payload {
                            msg: &frame,
                            aad: &aad(counter, true),
                        },
                    )
                    .map_err(|_| invalid())?;
                (plain, true)
            }
        };
        writer.write_all(&plain)?;
        total += plain.len() as u64;
        if last {
            let mut probe = [0u8; 1];
            return if reader.read(&mut probe)? == 0 {
                Ok(total)
            } else {
                Err(invalid())
            };
        }
        counter = counter.checked_add(1).ok_or_else(invalid)?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quick_key() -> Key {
        derive("secret", b"0123456789abcdef", 64, 1, 1).unwrap()
    }

    fn roundtrip(len: usize) {
        let key = quick_key();
        let data: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
        let mut sealed = Vec::new();
        assert_eq!(
            encrypt_stream(&key, data.as_slice(), &mut sealed).unwrap(),
            len as u64
        );
        let mut plain = Vec::new();
        assert_eq!(
            decrypt_stream(&key, sealed.as_slice(), &mut plain).unwrap(),
            len as u64
        );
        assert_eq!(plain, data);
    }

    #[test]
    fn roundtrips_various_sizes() {
        for len in [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK + 7] {
            roundtrip(len);
        }
    }

    #[test]
    fn detects_truncation_and_tampering() {
        let key = quick_key();
        let data = vec![7u8; 2 * CHUNK + 10];
        let mut sealed = Vec::new();
        encrypt_stream(&key, data.as_slice(), &mut sealed).unwrap();

        let truncated = &sealed[..13 + 4 + CHUNK + 16];
        assert!(decrypt_stream(&key, truncated, &mut Vec::new()).is_err());

        let mut tampered = sealed.clone();
        tampered[40] ^= 1;
        assert!(decrypt_stream(&key, tampered.as_slice(), &mut Vec::new()).is_err());

        let mut appended = sealed.clone();
        appended.push(0);
        assert!(decrypt_stream(&key, appended.as_slice(), &mut Vec::new()).is_err());
    }

    #[test]
    fn rejects_wrong_password() {
        let salt = b"0123456789abcdef";
        let key = derive("right", salt, 64, 1, 1).unwrap();
        let mut check = Vec::new();
        encrypt_stream(&key, CHECK_PLAINTEXT, &mut check).unwrap();
        let info = EncryptionInfo {
            algorithm: "aes-256-gcm-chunked".into(),
            kdf: "argon2id".into(),
            salt: to_hex(salt),
            memory_kib: 64,
            iterations: 1,
            parallelism: 1,
            check: to_hex(&check),
        };
        assert!(open_key("right", &info).is_ok());
        assert_eq!(
            open_key("wrong", &info).err().unwrap().code,
            ErrorCode::WrongPassword
        );
    }

    #[test]
    fn hex_roundtrip() {
        assert_eq!(from_hex(&to_hex(&[0, 15, 255])).unwrap(), vec![0, 15, 255]);
        assert!(from_hex("abc").is_err());
    }
}
