import pg from "pg";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    pool.on("error", (err) => {
      console.error("Unexpected error on idle Postgres client", err);
    });
  }
  return pool;
}
