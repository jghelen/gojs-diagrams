import pg from 'pg';

// The ids are "bigint" in the database, which the driver hands over as text,
// since such a number can be larger than JavaScript can hold exactly. Ours are
// counters that start at 1 and are used as the keys of nodes and lines, so they
// are read as numbers. That is exact up to 9,007,199,254,740,991.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

/**
 * The connections to the database. Where it is comes from the usual PostgreSQL
 * variables (see .env.example); the values here are used when one is not set.
 */
export function createPool(env: NodeJS.ProcessEnv = process.env): pg.Pool {
  return new pg.Pool({
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT) || 5432,
    user: env.PGUSER || 'postgres',
    password: env.PGPASSWORD,
    database: env.PGDATABASE || 'fund_diagrams',
  });
}
