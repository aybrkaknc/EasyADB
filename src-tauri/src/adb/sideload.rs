use regex::Regex;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

use super::process::{get_adb_path, CREATE_NO_WINDOW};

/// Start ADB Sideload with progress streaming
pub fn sideload_with_progress<F>(
    device_id: Option<&str>,
    path: &str,
    on_progress: F,
) -> Result<String, String>
where
    F: Fn(u32, String) + Send + 'static,
{
    let adb_path = get_adb_path();
    let mut args = Vec::new();

    if let Some(id) = device_id {
        args.push("-s");
        args.push(id);
    }
    args.push("sideload");
    args.push(path);

    let mut child = Command::new(adb_path)
        .args(&args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped()) // ADB usually prints progress to stdout, but sometimes mixed
        .spawn()
        .map_err(|e| format!("Failed to spawn sideload process: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let reader = BufReader::new(stdout);
    let re = Regex::new(r"\(~?(\d+)%\)").unwrap(); // Matches (~45%) or (45%)

    for line in reader.lines() {
        if let Ok(line) = line {
            // Parse percentage
            // Output format example: "serving: 'update.zip'  (~45%)"
            if let Some(caps) = re.captures(&line) {
                if let Some(pct_match) = caps.get(1) {
                    if let Ok(pct) = pct_match.as_str().parse::<u32>() {
                        on_progress(pct, line.clone());
                    }
                }
            } else {
                // Just log lines that don't match percentage (e.g. "Total xfer: ...")
                on_progress(0, line.clone());
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Process error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Sometimes ADB returns non-zero but succeeds (weird edge cases), but usually failure.
        return Err(format!("Sideload Failed: {}", stderr));
    }

    Ok("Sideload Complete".to_string())
}
