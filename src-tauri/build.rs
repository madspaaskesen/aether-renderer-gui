fn main() {
    // The Aether crates actually built in, shown in the About window.
    println!("cargo:rerun-if-changed=../Cargo.lock");
    let lock = std::fs::read_to_string("../Cargo.lock").unwrap_or_default();
    for (name, var) in [
        ("aether-renderer-core", "AETHER_CORE_VERSION"),
        ("aether-renderer-capture", "AETHER_CAPTURE_VERSION"),
    ] {
        let wanted = format!("name = \"{name}\"");
        let version = lock
            .split("[[package]]")
            .filter(|p| p.lines().any(|l| l.trim() == wanted))
            .find_map(|p| {
                p.lines()
                    .find_map(|l| l.trim().strip_prefix("version = \"")?.strip_suffix('"'))
                    .map(String::from)
            })
            .unwrap_or_else(|| "?".into());
        println!("cargo:rustc-env={var}={version}");
    }
    tauri_build::build()
}
