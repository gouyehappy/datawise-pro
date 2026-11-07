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

JAR=target/datawise-desktop-4.1.7.jar
if [[ ! -f "$JAR" ]]; then
  echo "Missing $JAR. Run: mvn -q package" >&2
  exit 1
fi
exec "$JAVA_BIN" -Djava.awt.headless=false -cp "$JAR:target/lib/*" org.apache.datawise.desktop.DatawiseDesktopApp "$@"
