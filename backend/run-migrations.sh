#!/bin/bash

# Check if a parameter was provided
if [ -z "$1" ]; then
  echo "Usage: $0 <postgres-url>"
  echo "Example: $0 postgres://user:password@localhost:5432/dbname"
  exit 1
fi

DB_URL=$1

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Error: Migrations directory not found at $MIGRATIONS_DIR"
  exit 1
fi

echo "Running migrations against: $DB_URL"

# Iterate over .sql files in the migrations directory in alphabetical order
# Use find to avoid issues with spaces and to ensure correct sorting
for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" | sort); do
  echo "--------------------------------------------------------------------------------"
  echo "Applying $(basename "$file")..."
  echo "--------------------------------------------------------------------------------"
  
  psql "$DB_URL" -f "$file" --quiet --set ON_ERROR_STOP=1
  
  if [ $? -ne 0 ]; then
    echo ""
    echo "CRITICAL ERROR: Failed to apply $(basename "$file")"
    echo "Migration process aborted."
    exit 1
  fi
done

echo ""
echo "================================================================================"
echo "All migrations applied successfully."
echo "================================================================================"
