//! Settings follow the OS user's language; unsupported languages use English.

fn language(locale: &str) -> &'static str {
    if locale
        .split(['-', '_', '.'])
        .next()
        .unwrap_or("")
        .eq_ignore_ascii_case("es")
    {
        "es"
    } else {
        "en"
    }
}

pub fn settings_language() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        let mut name = [0u16; 85];
        // Use the UI language, not the separately configurable regional format.
        // SAFETY: Windows receives a writable locale-name buffer.
        let length = unsafe {
            use windows::Win32::Globalization::{GetUserDefaultUILanguage, LCIDToLocaleName};
            LCIDToLocaleName(u32::from(GetUserDefaultUILanguage()), Some(&mut name), 0)
        };
        if length > 1 {
            return language(&String::from_utf16_lossy(&name[..length as usize - 1]));
        }
    }
    #[cfg(not(target_os = "windows"))]
    for key in ["LC_ALL", "LANGUAGE", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() {
                return language(value.split(':').next().unwrap_or(""));
            }
        }
    }
    "en"
}

#[cfg(test)]
mod tests {
    #[test]
    fn spanish_variants_and_english_fallback() {
        for locale in ["es", "es-ES", "es-MX", "es_AR.UTF-8", "ES_cl"] {
            assert_eq!(super::language(locale), "es");
        }
        for locale in ["", "C", "C.UTF-8", "en-US", "pt_BR", "estonian"] {
            assert_eq!(super::language(locale), "en");
        }
    }
}
