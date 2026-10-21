require('../config');

const mysql = require('mysql2/promise');

const sslCa = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
const sslEnabled = process.env.DB_SSL === 'true' || Boolean(sslCa);

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'skillswap',
  ...(sslEnabled ? { ssl: { ...(sslCa ? { ca: sslCa } : {}) } } : {}),
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

module.exports = pool;

