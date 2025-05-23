require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const authRoutes = require('./routes/auth');

// Middleware - order matters!
app.use(cors());
app.use(express.json());

// Use auth routes
app.use('/api/auth', authRoutes);

// Create MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'nian',
  database: 'gaming_community',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test DB connection on server start
pool.getConnection()
  .then(conn => {
    console.log('Connected to MySQL database');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1); // Exit app if DB connection fails
  });

// Routes

// Get all games
app.get('/api/games', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM GAME');
    console.log('DB rows:', rows);
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

// Get comments for a game
app.get('/api/comments/:gameId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.comment_id, c.content, c.created_at, u.username, c.parent_comment_id
      FROM COMMENT c
      JOIN USER u ON c.user_id = u.user_id
      WHERE c.game_id = ?
    `, [req.params.gameId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get platforms for a game
app.get('/api/game-platforms/:gameId', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.platform_name
      FROM GAME_PLATFORM gp
      JOIN PLATFORM p ON gp.platform_id = p.platform_id
      WHERE gp.game_id = ?
    `, [req.params.gameId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching platforms:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a game to a user's list
app.post('/api/user-game-list', async (req, res) => {
  const { user_id, game_id, status, score, review, hours_played } = req.body;
  try {
    const [result] = await pool.query(`
      INSERT INTO USER_GAME_LIST (user_id, game_id, status, score, review, hours_played)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [user_id, game_id, status, score, review, hours_played]);
    res.status(201).json({ list_entry_id: result.insertId });
  } catch (err) {
    console.error('Error adding game to list:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware - should be last
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// backend/server.js or backend/routes/profile.js (then import it)
const authenticateToken = require('./middleware/authMiddleware');

app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({
    message: 'Welcome to your profile!',
    user: req.user, // comes from the decoded token
  });
});