//! Runtime permissions (camera, location, ...) read from `dumpsys package` and
//! granted again with `pm grant`.

use super::manifest::PermissionGrant;

fn indent(line: &str) -> usize {
    line.len() - line.trim_start().len()
}

/// Parses the `runtime permissions:` blocks of `dumpsys package <pkg>`.
pub fn parse_runtime_permissions(dump: &str) -> Vec<PermissionGrant> {
    let mut found: Vec<PermissionGrant> = Vec::new();
    let mut header_indent: Option<usize> = None;
    for line in dump.lines() {
        if line.trim().is_empty() {
            continue;
        }
        match header_indent {
            Some(base) if indent(line) > base => {
                if let Some((name, rest)) = line.trim().split_once(':') {
                    let name = name.trim();
                    if !name.is_empty() && !name.contains(' ') {
                        let granted = rest.contains("granted=true");
                        found.retain(|p| p.name != name);
                        found.push(PermissionGrant {
                            name: name.to_string(),
                            granted,
                        });
                    }
                }
            }
            _ => {
                header_indent = (line.trim() == "runtime permissions:").then(|| indent(line));
            }
        }
    }
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/// `pm grant` accepts only permission names; anything else is rejected before it reaches a shell.
pub fn is_valid_permission(name: &str) -> bool {
    !name.is_empty()
        && name.len() < 200
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Built line by line because `\` continuations in string literals strip the indentation,
    /// and the parser depends on it.
    fn dump() -> String {
        [
            "Packages:",
            "  Package [com.a] (123):",
            "    userId=10123",
            "    versionName=1.2.3",
            "    install permissions:",
            "      android.permission.INTERNET: granted=true",
            "    User 0: ceDataInode=1 installed=true",
            "      runtime permissions:",
            "        android.permission.CAMERA: granted=true, flags=[ USER_SET ]",
            "        android.permission.ACCESS_FINE_LOCATION: granted=false, flags=[ USER_SET ]",
            "        android.permission.POST_NOTIFICATIONS: granted=true, flags=[ ]",
            "      disabledComponents:",
            "        com.a.Foo",
        ]
        .join("\n")
    }

    #[test]
    fn parses_runtime_permissions_only() {
        let perms = parse_runtime_permissions(&dump());
        let names: Vec<_> = perms.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.CAMERA",
                "android.permission.POST_NOTIFICATIONS",
            ]
        );
        assert!(!perms[0].granted);
        assert!(perms[1].granted && perms[2].granted);
    }

    #[test]
    fn handles_missing_sections() {
        assert!(parse_runtime_permissions("").is_empty());
        assert!(parse_runtime_permissions("    runtime permissions:\n").is_empty());
    }

    #[test]
    fn validates_permission_names() {
        assert!(is_valid_permission("android.permission.CAMERA"));
        assert!(is_valid_permission("com.vendor.permission.X_Y"));
        assert!(!is_valid_permission("android.permission.CAMERA; reboot"));
        assert!(!is_valid_permission(""));
    }
}
