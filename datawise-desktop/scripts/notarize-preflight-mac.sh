#!/usr/bin/env bash
# Preflight checks for macOS signing + notarization (no upload).
#
# Usage:
#   bash datawise-desktop/scripts/notarize-preflight-mac.sh [path/to/DataWiseCLI.app]
#
# Exit 0 when tools / identity / auth look ready; non-zero otherwise.
set -euo pipefail

echo "[preflight] macOS notarization readiness"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "FAIL: must run on macOS" >&2
  exit 1
fi

fail=0

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "OK: $1"
  else
    echo "FAIL: missing $1" >&2
    fail=1
  fi
}

need_cmd codesign
need_cmd xcrun
need_cmd spctl

if xcrun --find notarytool >/dev/null 2>&1; then
  echo "OK: notarytool"
else
  echo "FAIL: notarytool not found (install Xcode CLT)" >&2
  fail=1
fi

if xcrun --find stapler >/dev/null 2>&1; then
  echo "OK: stapler"
else
  echo "FAIL: stapler not found" >&2
  fail=1
fi

IDENTITY="${MAC_SIGNING_IDENTITY:-}"
if [[ -z "${IDENTITY}" ]]; then
  echo "WARN: MAC_SIGNING_IDENTITY unset — will skip codesign in package builds"
else
  echo "OK: MAC_SIGNING_IDENTITY set (${IDENTITY})"
  if security find-identity -v -p codesigning 2>/dev/null | grep -F "${IDENTITY}" >/dev/null; then
    echo "OK: identity present in keychain"
  else
    echo "WARN: identity string not found in codesigning keychain listing"
  fi
fi

if [[ -n "${NOTARYTOOL_KEYCHAIN_PROFILE:-}" ]]; then
  echo "OK: NOTARYTOOL_KEYCHAIN_PROFILE=${NOTARYTOOL_KEYCHAIN_PROFILE}"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_TEAM_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
  echo "OK: APPLE_ID / APPLE_TEAM_ID / APPLE_APP_SPECIFIC_PASSWORD set"
else
  echo "WARN: no notarytool auth (set NOTARYTOOL_KEYCHAIN_PROFILE or APPLE_ID+TEAM+PASSWORD)"
fi

APP="${1:-}"
if [[ -n "${APP}" ]]; then
  if [[ ! -d "${APP}" ]]; then
    echo "FAIL: app path not found: ${APP}" >&2
    fail=1
  else
    echo "OK: app path ${APP}"
    if codesign --verify --deep --strict "${APP}" 2>/dev/null; then
      echo "OK: codesign verify"
    else
      echo "WARN: codesign verify failed (sign with MAC_SIGNING_IDENTITY first)"
    fi
  fi
fi

if [[ "${fail}" -ne 0 ]]; then
  echo "[preflight] NOT ready"
  exit 1
fi

echo "[preflight] ready — set MAC_NOTARIZE=1 to notarize after package"
exit 0
