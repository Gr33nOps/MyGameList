require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
pool.getConnection()
  .then(conn => {
    console.log('Connected to MySQL database');
    conn.release();
  })
  .catch(err => console.error('Database connection failed:', err));

// Get all games
app.get('/api/games', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM GAME');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's game list
app.get('/api/user-game-list/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT g.game_id, g.title, g.developer, g.release_year, g.cover_art_url, g.description, g.avg_rating, g.rating_count,
             ugl.list_entry_id, ugl.status, ugl.score, ugl.hours_played, ugl.date_added, ugl.last_updated
      FROM USER_GAME_LIST ugl
      JOIN GAME g ON ugl.game_id = g.game_id
      WHERE ugl.user_id = ?
    `, [req.params.userId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching user game list:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user details
app.get('/api/users/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT user_id, username, email, bio, profile_picture, join_date FROM USER WHERE user_id = ?', [req.params.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));