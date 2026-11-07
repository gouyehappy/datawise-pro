# Project Maven helpers
#
# Default builds use Maven Central (required for GitHub Actions / desktop packaging).
# Optional China mirror (Aliyun) — pass explicitly when needed:
#
#   mvn -f datawise-backend/pom.xml -s datawise-backend/.mvn/settings.xml clean install
#
# Do NOT put -s/.mvn/settings.xml into maven.config: Maven 3.9+ one-arg-per-line
# parsing + mirrorOf=* breaks CI (Aliyun 502) and JetBrains JCEF resolution.
