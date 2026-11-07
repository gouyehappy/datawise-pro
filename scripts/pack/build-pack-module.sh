#!/usr/bin/env bash
# Compile packs/<packName>/module-src into backend/<packName>-module.jar
# Usage: build-pack-module.sh pack-ai | pack-migration | pack-backup
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACK_NAME="${1:-}"
if [[ -z "$PACK_NAME" ]]; then
  echo "Usage: build-pack-module.sh <pack-ai|pack-migration|pack-backup|...>"
  exit 2
fi

SRC="$ROOT/packs/$PACK_NAME/module-src"
OUT_DIR="$ROOT/packs/$PACK_NAME/backend"
JAR="$OUT_DIR/${PACK_NAME}-module.jar"
CLASSES="$ROOT/packs/$PACK_NAME/target/classes"

if [[ ! -d "$SRC" ]]; then
  echo "FAIL: missing module-src: $SRC"
  exit 1
fi

cd "$ROOT/datawise-backend"
mvn -q -pl datawise-common -am package -DskipTests
mvn -q -pl datawise-common dependency:build-classpath -Dmdep.outputFile=target/cp.txt
DEP_CP="$(cat datawise-common/target/cp.txt)"
if [[ "$DEP_CP" == *";"* ]]; then
  CP="datawise-common/target/classes;$DEP_CP"
else
  CP="datawise-common/target/classes:$DEP_CP"
fi

rm -rf "$CLASSES"
mkdir -p "$CLASSES" "$OUT_DIR"
find "$SRC" -name '*.java' > "$CLASSES/sources.txt"
# @argfile: use native paths for Windows javac when needed
SRC_LIST="$CLASSES/sources.txt"
OUT_CLASSES="$CLASSES"
OUT_JAR="$JAR"
if command -v cygpath >/dev/null 2>&1; then
  # rewrite source list to Windows paths for javac.exe
  while IFS= read -r line; do
    cygpath -w "$line"
  done < "$CLASSES/sources.txt" > "$CLASSES/sources.win.txt"
  SRC_LIST="$(cygpath -w "$CLASSES/sources.win.txt")"
  OUT_CLASSES="$(cygpath -w "$CLASSES")"
  OUT_JAR="$(cygpath -w "$JAR")"
  CP="datawise-common\\target\\classes;$DEP_CP"
fi
javac --release 17 -cp "$CP" -d "$OUT_CLASSES" @"$SRC_LIST"
mkdir -p "$CLASSES/META-INF/services"
cp -R "$SRC/META-INF/." "$CLASSES/META-INF/"
jar --create --file "$OUT_JAR" -C "$OUT_CLASSES" .
echo "OK $JAR"
