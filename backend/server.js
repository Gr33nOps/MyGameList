require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { body, param, validationResult } = require('express-validator');

// Import auth routes
let authRoutes;
try {
  authRoutes = require('./routes/auth');
} catch (err) {
  console.warn('Warning: ./routes/auth.js not found. Authentication routes disabled.');
  authRoutes = express.Router(); // Fallback to avoid crashes
}

// Import the REAL auth middleware (remove the placeholder)
const authenticateToken = require('./middleware/authMiddleware');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Authentication routes
app.use('/api/auth', authRoutes);

// MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'nian', 
  database: 'gaming_community',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test DB connection
pool.getConnection()
  .then(conn => {
    console.log('Connected to MySQL database');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

// Routes

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

// Get user's game list (now using proper authentication)
app.get(
  '/api/user-game-list/:userId',
  authenticateToken,  // Add authentication middleware
  [param('userId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Security check: ensure user can only access their own list
    const requestedUserId = parseInt(req.params.userId);
    const authenticatedUserId = req.user.id;
    
    if (requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Access denied: You can only view your own game list' });
    }

    try {
      console.log(`Fetching games for authenticated user ID: ${authenticatedUserId}`);
      const [rows] = await pool.query(
        `
        SELECT g.game_id, g.title, g.developer, g.release_year, g.cover_art_url, g.description, g.avg_rating, g.rating_count,
               ugl.list_entry_id, ugl.status, ugl.score, ugl.hours_played, ugl.date_added, ugl.last_updated
        FROM USER_GAME_LIST ugl
        JOIN GAME g ON ugl.game_id = g.game_id
        WHERE ugl.user_id = ?
      `,
        [authenticatedUserId]
      );
      console.log(`Found ${rows.length} games for user ${authenticatedUserId}`);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching user game list:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get user details
app.get(
  '/api/users/:userId',
  [param('userId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        'SELECT user_id, username, email, bio, profile_picture, join_date FROM USER WHERE user_id = ?',
        [req.params.userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get comments for a game
app.get(
  '/api/comments/:gameId',
  [param('gameId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT c.comment_id, c.content, c.created_at, u.username, c.parent_comment_id
        FROM COMMENT c
        JOIN USER u ON c.user_id = u.user_id
        WHERE c.game_id = ?
        ORDER BY c.created_at DESC
      `,
        [req.params.gameId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching comments:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get platforms for a game
app.get(
  '/api/game-platforms/:gameId',
  [param('gameId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT p.platform_id, p.platform_name
        FROM GAME_PLATFORM gp
        JOIN PLATFORM p ON gp.platform_id = p.platform_id
        WHERE gp.game_id = ?
      `,
        [req.params.gameId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching platforms:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Add game to user's list (authenticated)
app.post(
  '/api/user-game-list',
  authenticateToken,
  [
    body('game_id').isInt({ min: 1 }).withMessage('Invalid game ID'),
    body('status')
      .isIn(['playing', 'completed', 'dropped', 'plan_to_play'])
      .withMessage('Invalid status'),
    body('score')
      .optional({ nullable: true })
      .isInt({ min: 0, max: 10 })
      .withMessage('Score must be between 0 and 10'),
    body('review')
      .optional({ nullable: true })
      .isString()
      .withMessage('Review must be a string'),
    body('hours_played')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Hours played must be non-negative')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    console.log('Request body:', req.body);
    console.log('Authenticated user ID:', req.user.id);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { game_id, status, score, review, hours_played } = req.body;
    const user_id = req.user.id;

    try {
      // Verify game exists
      const [gameCheck] = await pool.query('SELECT 1 FROM GAME WHERE game_id = ?', [
        game_id
      ]);
      if (gameCheck.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      // Check for duplicate entry
      const [existing] = await pool.query(
        'SELECT 1 FROM USER_GAME_LIST WHERE user_id = ? AND game_id = ?',
        [user_id, game_id]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Game already in user list' });
      }

      // Insert new entry
      const [result] = await pool.query(
        `
        INSERT INTO USER_GAME_LIST (user_id, game_id, status, score, review, hours_played, date_added, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
        [user_id, game_id, status, score, review, hours_played]
      );

      console.log(`Successfully added game ${game_id} to user ${user_id} list`);
      res.status(201).json({ list_entry_id: result.insertId });
    } catch (err) {
      console.error('Error adding game to list:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Update a game in user's list (authenticated)
app.put(
  '/api/user-game-list/:listEntryId',
  authenticateToken,
  [
    param('listEntryId').isInt({ min: 1 }).withMessage('Invalid list entry ID'),
    body('status')
      .optional()
      .isIn(['playing', 'completed', 'dropped', 'plan_to_play'])
      .withMessage('Invalid status'),
    body('score')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Score must be between 0 and 10'),
    body('review')
      .optional()
      .isString()
      .trim()
      .withMessage('Invalid review'),
    body('hours_played')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Hours played must be non-negative')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { listEntryId } = req.params;
    const { status, score, review, hours_played } = req.body;
    const user_id = req.user.id;

    try {
      // Verify entry exists and belongs to user
      const [entryCheck] = await pool.query(
        'SELECT 1 FROM USER_GAME_LIST WHERE list_entry_id = ? AND user_id = ?',
        [listEntryId, user_id]
      );
      if (entryCheck.length === 0) {
        return res.status(404).json({ error: 'List entry not found or unauthorized' });
      }

      // Build dynamic update query
      const updates = {};
      if (status) updates.status = status;
      if (score !== undefined) updates.score = score;
      if (review !== undefined) updates.review = review;
      if (hours_played !== undefined) updates.hours_played = hours_played;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      updates.last_updated = new Date();

      const fields = Object.keys(updates)
        .map(key => `${key} = ?`)
        .join(', ');
      const values = Object.values(updates);

      await pool.query(
        `UPDATE USER_GAME_LIST SET ${fields}, last_updated = ? WHERE list_entry_id = ?`,
        [...values, updates.last_updated, listEntryId]
      );

      res.json({ message: 'Game list entry updated' });
    } catch (err) {
      console.error('Error updating game list entry:', err.message, err.stack);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

// Delete a game from user's list (authenticated)
app.delete(
  '/api/user-game-list/:listEntryId',
  authenticateToken,
  [param('listEntryId').isInt({ min: 1 }).withMessage('Invalid list entry ID')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { listEntryId } = req.params;
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'User authentication failed' });
    }

    try {
      // Verify entry exists and belongs to user
      const [entryCheck] = await pool.query(
        'SELECT 1 FROM USER_GAME_LIST WHERE list_entry_id = ? AND user_id = ?',
        [listEntryId, user_id]
      );
      if (entryCheck.length === 0) {
        return res.status(404).json({ error: 'List entry not found or unauthorized' });
      }

      await pool.query('DELETE FROM USER_GAME_LIST WHERE list_entry_id = ?', [
        listEntryId
      ]);

      res.json({ message: 'Game removed from list' });
    } catch (err) {
      console.error('Error deleting game list entry:', err.message, err.stack);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

// Get all genres
app.get('/api/genres', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM GENRE');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching genres:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get genres for a game
app.get(
  '/api/game-genres/:gameId',
  [param('gameId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT g.genre_id, g.genre_name
        FROM GAME_GENRE gg
        JOIN GENRE g ON gg.genre_id = g.genre_id
        WHERE gg.game_id = ?
      `,
        [req.params.gameId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching game genres:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get custom lists for a user
app.get(
  '/api/custom-lists/:userId',
  [param('userId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT custom_list_id, list_name, description, is_public, created_at
        FROM CUSTOM_LIST
        WHERE user_id = ?
      `,
        [req.params.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching custom lists:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get entries for a custom list
app.get(
  '/api/custom-list-entries/:customListId',
  [param('customListId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT cle.entry_id, cle.position, cle.added_at, g.title
        FROM CUSTOM_LIST_ENTRY cle
        JOIN GAME g ON cle.game_id = g.game_id
        WHERE cle.custom_list_id = ?
        ORDER BY cle.position
      `,
        [req.params.customListId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching custom list entries:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get friendships for a user
app.get(
  '/api/friendships/:userId',
  [param('userId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT f.friendship_id, f.status, f.created_at, f.updated_at,
               u1.username AS requester, u2.username AS addressee
        FROM FRIENDSHIP f
        JOIN USER u1 ON f.requester_id = u1.user_id
        JOIN USER u2 ON f.addressee_id = u2.user_id
        WHERE f.requester_id = ? OR f.addressee_id = ?
      `,
        [req.params.userId, req.params.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching friendships:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get activities for a user
app.get(
  '/api/activities/:userId',
  [param('userId').isInt({ min: 1 }).toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const [rows] = await pool.query(
        `
        SELECT activity_id, activity_type, reference_id, details, created_at
        FROM ACTIVITY
        WHERE user_id = ?
        ORDER BY created_at DESC
      `,
        [req.params.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error fetching activities:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Protected profile route
app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({
    message: 'Welcome to your profile!',
    user: req.user
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});