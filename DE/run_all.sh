#!/usr/bin/env bash
# Rebuilds the MuseumX demo database and re-runs every SQL deliverable.
# Usage:  export PGHOST=localhost PGUSER=<user> PGPASSWORD=<pw>; createdb museumx; ./run_all.sh museumx
set -e
DB=${1:-museumx}; Q="psql -d $DB -q -v ON_ERROR_STOP=1"; R="psql -d $DB"
load() { $Q -f sql/schema.sql 2>&1 | grep -v NOTICE || true; $Q -f sql/constraints_and_indexes.sql; $Q -f sql/sample_data.sql; }
mkdir -p evidence
load; $R -f sql/queries.sql           > evidence/query_outputs.txt 2>&1
load; $R -f sql/integrity_tests.sql   > evidence/integrity_test_outputs.txt 2>&1
load; $R -f sql/index_demo.sql 2>&1 | grep -E "^---|Scan|Sort|Execution" > evidence/index_demo_output.txt
load; $R -f sql/extension_booking_item.sql > evidence/extension_output.txt 2>&1
load; (cd backend_integration && npm install --silent && DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST:-localhost}:5432/$DB" node demo.js > ../evidence/integration_log.txt 2>&1)
echo "Done. See the evidence/ folder."
