const mysql = require('mysql2/promise');

let pool = null;

async function initSqlPool() {
  if (pool) return pool;

  const env = process.env;
  const host = (env.SQL_HOST || env.DB_HOST || '127.0.0.1').replace(/^['"]|['"]$/g, '').trim();
  const port = Number(env.SQL_PORT || env.DB_PORT || '3306');
  const user = (env.SQL_USER || env.DB_USER || 'root').replace(/^['"]|['"]$/g, '').trim();
  const password = (env.SQL_PASSWORD || env.DB_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const database = (env.SQL_DATABASE || env.DB_DATABASE || 'nikahnav_prod').replace(/^['"]|['"]$/g, '').trim();
  const connLimit = Number(env.SQL_CONN_LIMIT || '10');

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: connLimit,
    queueLimit: 0,
    timezone: 'Z'
  });

  // Simple connectivity check
  await pool.query('SELECT 1');
  return pool;
}

function getPool() {
  if (!pool) throw new Error('SQL pool not initialized. Call initSqlPool() first.');
  return pool;
}

async function sqlQuery(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

module.exports = { initSqlPool, getPool, sqlQuery };
