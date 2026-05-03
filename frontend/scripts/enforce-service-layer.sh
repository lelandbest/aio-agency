#!/bin/bash

echo "Checking for forbidden API usage..."

FAIL=0

check() {
  RESULT=$(grep -R "$1" src/ --exclude-dir=services --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" 2>/dev/null)
  if [ ! -z "$RESULT" ]; then
    echo "❌ Found forbidden usage: $1"
    echo "$RESULT"
    FAIL=1
  fi
}

check "@/api/"
check "../api/"
check "fetch("
check "axios("
check "request("
check "withSessionToken"
check "from.*backendApi"
check "toSnakeCase.*from.*service"
check "normalizeSourceUrl.*from.*service"

echo "Checking for backup/temp files..."
TMPFILES=$(find src/ -type f \( -name "*.tmp" -o -name "*.bak" -o -name "*.old" -o -name "*.orig" -o -name "*.backup" \) 2>/dev/null)
if [ ! -z "$TMPFILES" ]; then
  echo "❌ Found backup/temp files:"
  echo "$TMPFILES"
  FAIL=1
fi

if [ $FAIL -eq 1 ]; then
  echo "🚫 Service layer violation detected. Failing build."
  exit 1
else
  echo "✅ Service layer enforcement passed."
fi