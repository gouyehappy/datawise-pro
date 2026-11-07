#!/usr/bin/env bash
# Compatibility wrapper — prefer build-pack-module.sh pack-ai
exec "$(cd "$(dirname "$0")" && pwd)/build-pack-module.sh" pack-ai
