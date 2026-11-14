#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

JAVA_BIN=java
shopt -s nullglob
for d in target/jbr-cache/jbr_jcef-*; do
  if [[ -x "$d/bin/java" ]]; then
    JAVA_BIN="$d/bin/java"
  elif [[ -x "$d/Contents/Home/bin/java" ]]; then
    JAVA_BIN="$d/Contents/Home/bin/java"
  fi
done
shopt -u nullglob

if [[ "$JAVA_BIN" != "java" ]]; then
  echo "[run-desktop] using jbr_jcef: $JAVA_BIN"
else
  echo "[run-desktop] WARNING: no target/jbr-cache jbr_jcef found; plain JDK may fail CEF."
  echo "             Run: node scripts/ensure-and-run.mjs"
fi

# Resolve jar from pom version, then newest datawise-desktop-*.jar (no hardcoded X.Y.Z).
VERSION=$(sed -n 's/.*<version>\([^<]*\)<\/version>.*/\1/p' pom.xml | head -n 1 | tr -d '[:space:]')
JAR=""
if [[ -n "$VERSION" && -f "target/datawise-desktop-${VERSION}.jar" ]]; then
  JAR="target/datawise-desktop-${VERSION}.jar"
else
  shopt -s nullglob
  candidates=(target/datawise-desktop-*.jar)
  shopt -u nullglob
  newest=""
  newest_mtime=0
  for c in "${candidates[@]}"; do
    [[ "$c" == *-sources.jar ]] && continue
    mtime=$(stat -c %Y "$c" 2>/dev/null || stat -f %m "$c" 2>/dev/null || echo 0)
    if (( mtime >= newest_mtime )); then
      newest_mtime=$mtime
      newest=$c
    fi
  done
  JAR=$newest
fi

if [[ -z "$JAR" || ! -f "$JAR" ]]; then
  echo "Missing target/datawise-desktop-*.jar. Run: mvn -q package" >&2
  exit 1
fi
echo "[run-desktop] jar=$JAR"
exec "$JAVA_BIN" -Djava.awt.headless=false -cp "$JAR:target/lib/*" org.apache.datawise.desktop.DatawiseDesktopApp "$@"
