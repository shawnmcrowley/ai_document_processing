import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  password: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'pgvector_db',
})

// Use environment variables from .env.local
/*
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  max: 10, // pool size
  idleTimeoutMillis: 30000,
});

*/
export default {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
