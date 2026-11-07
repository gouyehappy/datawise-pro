#!/usr/bin/env bash
# Notarize a signed DataWiseCLI.app (or .dmg) with Apple notarytool, then staple.
#
# Prerequisites:
#   - MAC_SIGNING_IDENTITY already used to codesign the app (Developer ID Application)
#   - Xcode command-line tools (notarytool / stapler)
#
# Auth (pick one):
#   export NOTARYTOOL_KEYCHAIN_PROFILE="DataWiseCLI-notary"   # preferred
#   # or:
#   export APPLE_ID="you@example.com"
#   export APPLE_TEAM_ID="TEAMID"
#   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#
# Usage:
#   bash datawise-desktop/scripts/notarize-mac.sh path/to/DataWiseCLI.app
#   bash datawise-desktop/scripts/notarize-mac.sh path/to/DataWiseCLI.dmg
#
# Package builds can set MAC_NOTARIZE=1 to invoke this automatically after codesign.
set -euo pipefail

TARGET="${1:-}"
if [[ -z "${TARGET}" || ! -e "${TARGET}" ]]; then
  echo "usage: $0 <DataWiseCLI.app|DataWiseCLI.dmg>" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "notarize-mac.sh requires macOS" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found — install Xcode Command Line Tools" >&2
  exit 1
fi

AUTH_ARGS=()
if [[ -n "${NOTARYTOOL_KEYCHAIN_PROFILE:-}" ]]; then
  AUTH_ARGS+=(--keychain-profile "${NOTARYTOOL_KEYCHAIN_PROFILE}")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  AUTH_ARGS+=(--apple-id "${APPLE_ID}" --team-id "${APPLE_TEAM_ID}" --password "${APPLE_APP_SPECIFIC_PASSWORD}")
else
  echo "Set NOTARYTOOL_KEYCHAIN_PROFILE or APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD" >&2
  exit 1
fi

echo "[notarize] submitting ${TARGET}…"
xcrun notarytool submit "${TARGET}" "${AUTH_ARGS[@]}" --wait

echo "[notarize] stapling ${TARGET}…"
xcrun stapler staple "${TARGET}"

echo "[notarize] verifying…"
if [[ "${TARGET}" == *.app ]]; then
  spctl --assess --type execute -vv "${TARGET}" || true
  codesign --verify --deep --strict --verbose=2 "${TARGET}" || true
else
  spctl --assess --type open --context context:primary-signature -vv "${TARGET}" || true
fi

echo "[notarize] done"
