#!/usr/bin/env bash
#
# Creates the database of the fund-structure editor: the database itself, its
# tables, and the legal entity types the app starts with.
#
#   backend/db/setup.sh                 an empty database
#   backend/db/setup.sh --with-sample   the same, plus 45 diagrams to look at
#
# Where the PostgreSQL server is, and who you are, comes from the usual
# variables; these are the values used when they are not set:
#
#   PGHOST=localhost   PGPORT=5432   PGUSER=postgres   PGDATABASE=fund_diagrams
#
# For example, for a server on port 5433:   PGPORT=5433 backend/db/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
database="${PGDATABASE:-fund_diagrams}"
# The tools below would each ask for the password; ask once instead.
if [ -z "${PGPASSWORD:-}" ]; then
  read -r -s -p "Password of $PGUSER on $PGHOST:$PGPORT: " PGPASSWORD
  echo
  export PGPASSWORD
fi

createdb "$database"
psql --quiet --set ON_ERROR_STOP=1 --dbname "$database" --file 001_schema.sql --file 002_seed.sql
if [ "${1:-}" = "--with-sample" ]; then
  psql --quiet --set ON_ERROR_STOP=1 --dbname "$database" \
    --file 003_sample_diagram.sql --file 004_more_diagrams.sql
fi

echo "Database \"$database\" is ready on $PGHOST:$PGPORT."
psql --quiet --tuples-only --dbname "$database" --command \
  "select '  ' || (select count(*) from legal_entity_type) || ' legal entity types, '
       || (select count(*) from legal_entity) || ' legal entities, '
       || (select count(*) from user_defined_field) || ' user-defined fields, '
       || (select count(*) from diagram) || ' diagrams'"
