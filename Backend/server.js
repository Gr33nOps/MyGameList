const express = require('express');
const cors = require('cors');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration
const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  }
});

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, display_name, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [userId] = await db('users').insert({
      username,
      email,
      display_name,
      password_hash: hashedPassword
    });
    
    const user = await db('users')
      .where({ id: userId })
      .select('id', 'username', 'email', 'display_name')
      .first();
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ token, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db('users').where({ username }).first();
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.userId })
      .select('id', 'username', 'email', 'display_name')
      .first();
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Games Routes
app.get('/api/games', async (req, res) => {
  try {
    const { search } = req.query;
    let query = db('games')
      .select('id', 'name', 'background_image', 'rating', 'description');

    if (search) {
      query = query.where('name', 'like', `%${search}%`);
    }

    const games = await query;

    // Fetch genres for each game
    for (let game of games) {
      game.genres = await db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('game_genres.game_id', game.id)
        .select('genres.id', 'genres.name');
    }

    res.json({ games });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await db('games')
      .where({ id: req.params.id })
      .select(
        'id', 'name', 'description', 'background_image', 
        'rating', 'metacritic_score', 'playtime',
        db.raw("DATE_FORMAT(released, '%Y-%m-%d') as released")
      )
      .first();
    
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Fetch related data
    game.genres = await db('game_genres')
      .join('genres', 'game_genres.genre_id', 'genres.id')
      .where('game_genres.game_id', game.id)
      .select('genres.id', 'genres.name');

    game.publishers = await db('game_publishers')
      .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
      .where('game_publishers.game_id', game.id)
      .select('publishers.id', 'publishers.name');

    game.developers = await db('game_developers')
      .join('developers', 'game_developers.developer_id', 'developers.id')
      .where('game_developers.game_id', game.id)
      .select('developers.id', 'developers.name');

    game.platforms = await db('game_platforms')
      .join('platforms', 'game_platforms.platform_id', 'platforms.id')
      .where('game_platforms.game_id', game.id)
      .select('platforms.id', 'platforms.name');

    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User Games Routes
app.get('/api/user/games', verifyToken, async (req, res) => {
  try {
    const games = await db('user_game_lists')
      .join('games', 'user_game_lists.game_id', 'games.id')
      .where('user_game_lists.user_id', req.userId)
      .select(
        'games.id', 
        'games.name', 
        'user_game_lists.score'
      );

    res.json({ games });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/user/games/:id', verifyToken, async (req, res) => {
  try {
    const { status, score } = req.body;
    const gameId = req.params.id;

    const game = await db('games').where({ id: gameId }).first();
    if (!game) return res.status(404).json({ error: 'Game not found' });

    await db('user_game_lists')
      .insert({
        user_id: req.userId,
        game_id: gameId,
        status: status || 'completed',
        score: score !== undefined ? score : null
      })
      .onConflict(['user_id', 'game_id'])
      .merge();

    res.json({ message: 'Game added/updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/user/games/:id', verifyToken, async (req, res) => {
  try {
    const { status, score, progress_hours } = req.body;
    const gameId = req.params.id;

    const game = await db('games').where({ id: gameId }).first();
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const existingEntry = await db('user_game_lists')
      .where({ user_id: req.userId, game_id: gameId })
      .first();
    if (!existingEntry) return res.status(404).json({ error: 'Game not in your list' });

    await db('user_game_lists')
      .where({ user_id: req.userId, game_id: gameId })
      .update({
        status: status || existingEntry.status,
        score: score !== undefined ? score : existingEntry.score,
        progress_hours: progress_hours !== undefined ? progress_hours : existingEntry.progress_hours,
        updated_at: db.fn.now()
      });

    res.json({ message: 'Game updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/user/games/:id', verifyToken, async (req, res) => {
  try {
    const deleted = await db('user_game_lists')
      .where({ user_id: req.userId, game_id: req.params.id })
      .delete();
    
    if (!deleted) return res.status(404).json({ error: 'Game not found in your list' });
    
    res.json({ message: 'Game removed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});