require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'nian',
        database: 'gaming_community',
  });

  try {
    const [rows] = await pool.query('SELECT * FROM GAME');
    console.log(rows);
  } catch (err) {
    console.error('Query error:', err);
  }
  process.exit(0);
}

test();
