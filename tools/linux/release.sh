#!/bin/bash
# tauri-action calls this in app/: build, finalize the payload, then sign final bytes.
set -euo pipefail
script_dir=$(cd "$(dirname "$0")" && pwd)
repo=$(realpath "$script_dir/../..")
work=${MIRLO_LINUX_WORK:-/tmp/mirlo-linux}
test "${1:-}" = build
test "$(uname -m)" = x86_64
test -f "$work/codecs/lib/libavcodec.so.59"
test -n "${TAURI_SIGNING_PRIVATE_KEY:-${TAURI_SIGNING_PRIVATE_KEY_PATH:-}}"
version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$repo/app/src-tauri/tauri.conf.json")
target=$(cargo metadata --no-deps --format-version 1 --manifest-path "$repo/app/src-tauri/Cargo.toml" | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')
tauri "$@" --config '{"bundle":{"createUpdaterArtifacts":false}}'
bundle="$target/release/bundle"
image="$bundle/appimage/Mirlo_${version}_amd64.AppImage"
appdir="$bundle/appimage/Mirlo.AppDir"
python3 "$script_dir/assemble.py" "$appdir" "$work"
python3 "$script_dir/sources.py" "$appdir" "$work" "$image"
python3 "$script_dir/repack.py" "$image" "$appdir"
for artifact in "$image" "$bundle/deb/Mirlo_${version}_amd64.deb"; do
    tauri signer sign --app-version "$version" "$artifact"
done
