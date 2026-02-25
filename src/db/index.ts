import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  pool: mysql.Pool | undefined;
};

function getPool() {
  if (!globalForDb.pool) {
    globalForDb.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mflscout',
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: process.env.DB_HOST?.includes('tidbcloud') ? { rejectUnauthorized: true } : undefined,
    });
  }
  return globalForDb.pool;
}

export function getDb() {
  const pool = getPool();
  return drizzle(pool, { schema, mode: 'default' });
}
