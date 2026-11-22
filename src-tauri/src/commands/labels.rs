use crate::services::package_db;
use tauri::State;

// =====================================================================
// PACKAGE LABEL RESOLUTION (With Self-Learning Database)
// =====================================================================

#[tauri::command]
pub async fn resolve_package_label(
    state: State<'_, package_db::PackageDB>,
    package_name: String,
) -> Result<Option<String>, String> {
    // 1. Local Database Lookup (Fast Cache)
    if let Some(name) = state.inner().get(&package_name) {
        return Ok(Some(name));
    }

    // 2. Online Lookup (Google Play Store)
    let url = format!(
        "https://play.google.com/store/apps/details?id={}&hl=en",
        package_name
    );
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(&url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let document = scraper::Html::parse_document(&html);
                    let title_selector = scraper::Selector::parse("h1[itemprop='name']").unwrap();

                    if let Some(element) = document.select(&title_selector).next() {
                        let raw_title = element.text().collect::<Vec<_>>().join("");
                        let title = raw_title.trim().to_string();

                        // 3. Cache and Persist
                        state.inner().insert(package_name, title.clone());
                        return Ok(Some(title));
                    }

                    // Alternative selector
                    let alt_selector = scraper::Selector::parse("h1").unwrap();
                    if let Some(element) = document.select(&alt_selector).next() {
                        let raw_title = element.text().collect::<Vec<_>>().join("");
                        let title = raw_title.trim().to_string();
                        if !title.is_empty() && title.len() < 100 {
                            state.inner().insert(package_name, title.clone());
                            return Ok(Some(title));
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    Ok(None)
}
