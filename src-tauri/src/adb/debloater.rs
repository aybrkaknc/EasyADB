use serde::{Deserialize, Serialize};

use super::process::run_command;

// =====================================================================
// DEBLOATER FONKSİYONLARI
// =====================================================================

/// Debloater için genişletilmiş paket bilgisi
#[derive(Serialize, Debug, Clone)]
pub struct DebloaterPackage {
    pub name: String,
    pub is_system: bool,
    pub is_disabled: bool,
    pub is_uninstalled: bool,
    pub description: Option<String>,
    pub recommendation: Option<String>, // safe, advanced, unsafe, unknown
}

#[derive(Deserialize, Debug)]
struct KnowledgeEntry {
    id: String,
    description: String,
    recommendation: String,
}

fn load_knowledge_base() -> std::collections::HashMap<String, KnowledgeEntry> {
    let mut map = std::collections::HashMap::new();
    // In production, this path should be resolved relative to resource dir
    // For dev, we point to source.
    // Ideally, embed this into binary or use Tauri resource API
    // Let's rely on a fixed path relative to CWD for now or embedded string if small

    // Better approach: Embed the JSON string into the binary for speed and portability
    let json_content = include_str!("../../assets/knowledge_base.json");

    if let Ok(entries) = serde_json::from_str::<Vec<KnowledgeEntry>>(json_content) {
        let count = entries.len();
        for entry in entries {
            map.insert(entry.id.clone(), entry);
        }
        println!("Knowledge base loaded: {} entries", count);
    } else {
        println!("FAILED to parse knowledge_base.json!");
    }
    map
}

/// Tüm paketleri listeler (sistem + kullanıcı + uninstalled).
/// Debloater modülü için.
pub fn get_all_packages(device_id: &str) -> Result<Vec<DebloaterPackage>, String> {
    // Yardımcı fonksiyon: Komut başarısız olursa loglar ama akışı kesmez
    let run_cmd_safe = |args: &[&str]| -> String {
        match run_command(args) {
            Ok(out) => out,
            Err(_) => String::new(), // Hata durumunda boş döndür
        }
    };

    // Tüm paketleri al (sadece yüklü olanlar) - Bu ana komut, başarısız olursa yine de devam etsin
    let installed_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages"]);
    let installed_packages: std::collections::HashSet<String> = installed_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    // Tüm paketleri al (uninstalled dahil, -u flag'i)
    // Eğer installed_output boşsa, muhtemelen ADB sorunu vardır ama yine de deneyelim
    let mut all_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-u"]);

    // Eğer -u desteklenmiyorsa veya çıktı boşsa, installed listesini baz alalım
    if all_output.trim().is_empty() {
        all_output = installed_output;
    }

    // Sistem paketlerini al
    let system_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-s"]);
    let system_packages: std::collections::HashSet<String> = system_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    // Devre dışı bırakılmış paketleri al
    let disabled_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-d"]);
    let disabled_packages: std::collections::HashSet<String> = disabled_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    let mut packages = Vec::new();
    let knowledge_map = load_knowledge_base();

    for line in all_output.lines() {
        if let Some(name) = line.strip_prefix("package:") {
            let name = name.trim().to_string();
            let is_uninstalled = !installed_packages.contains(&name) && !name.is_empty();

            let (description, recommendation) = if let Some(entry) = knowledge_map.get(&name) {
                (
                    Some(entry.description.clone()),
                    Some(entry.recommendation.clone()),
                )
            } else {
                (None, None)
            };

            packages.push(DebloaterPackage {
                is_system: system_packages.contains(&name),
                is_disabled: disabled_packages.contains(&name),
                is_uninstalled,
                name,
                description,
                recommendation,
            });
        }
    }

    packages.sort_by(|a, b| a.name.cmp(&b.name));

    // Eğer hiç paket bulunamadıysa (kritik ADB hatası), o zaman hata dön
    if packages.is_empty() {
        return Err("No packages found. ADB connection failure or locked device.".to_string());
    }

    Ok(packages)
}

/// Bir paketi devre dışı bırakır (geri dönüşü kolay).
pub fn disable_package(device_id: &str, package_name: &str) -> Result<String, String> {
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "disable-user",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!("Package '{}' disabled.", package_name))
}

/// Bir paketi etkinleştirir (devre dışı bırakılmış paketi geri açar).
pub fn enable_package(device_id: &str, package_name: &str) -> Result<String, String> {
    // --user 0 parametresi modern Android sürümlerinde izin sorunlarını aşmaya yardımcı olabilir
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "enable",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!("Package '{}' enabled.", package_name))
}

/// Bir paketi kaldırır (mevcut kullanıcı için, cihazı bozmaz).
/// --user 0 ile system çökmez, fabrika ayarlarında geri gelir.
pub fn uninstall_package(device_id: &str, package_name: &str) -> Result<String, String> {
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "uninstall",
        "-k",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!(
        "Package '{}' uninstalled for current user.",
        package_name
    ))
}

/// Önceden uninstall edilmiş bir paketi yeniden yükler.
/// Sadece --user 0 ile kaldırılmış paketler için çalışır.
pub fn reinstall_package(device_id: &str, package_name: &str) -> Result<String, String> {
    // Attempt 1: cmd package install-existing (Standard for newer Android)
    // We ignore the error here to try the fallback
    let output1 = run_command(&[
        "-s",
        device_id,
        "shell",
        "cmd",
        "package",
        "install-existing",
        package_name,
    ]);

    if output1.is_ok() {
        return Ok(format!(
            "Package '{}' reinstalled successfully.",
            package_name
        ));
    }

    // Attempt 2: pm install-existing (Legacy / Alternative)
    match run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "install-existing",
        package_name,
    ]) {
        Ok(_) => Ok(format!(
            "Package '{}' reinstalled (legacy method).",
            package_name
        )),
        Err(e) => {
            // If both failed, return a descriptive error
            Err(format!("Failed to reinstall '{}'. NOTE: User (Downloaded) apps cannot be restored via ADB if fully uninstalled. You must reinstall them from Play Store. Original Error: {}", package_name, e))
        }
    }
}
