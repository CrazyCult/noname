import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  connection: mysql.Connection | undefined;
};

async function getConnection() {
  if (!globalForDb.connection) {
    globalForDb.connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mflscout',
      port: Number(process.env.DB_PORT) || 3306,
    });
  }
  return globalForDb.connection;
}

export async function getDb() {
  const connection = await getConnection();
  return drizzle(connection, { schema, mode: 'default' });
}
