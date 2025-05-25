const express = require('express');
const cors = require('cors');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// Database configuration
const db = knex({
  client: 'mysql2',
  connection: {
    host: 'localhost',
    user: 'zain',      // Replace with your DB user
    password: '123', // Replace with your DB password
    database: 'MY_GAME_LIST'
  }
});

// JWT Secret (should be stored in environment variables in production)
const JWT_SECRET = '123'; // Replace with a secure secret

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
    
    const user = await db('users').where({ id: userId }).first();
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
    res.json({ token, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.userId })
      .select('id', 'username', 'email', 'display_name', 'avatar_url')
      .first();
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Games Routes
app.get('/api/games', async (req, res) => {
  try {
    const { page = 1, limit = 20, ordering = '-rating', search, genre } = req.query;
    const offset = (page - 1) * limit;

    // Base query without selecting columns yet
    let query = db('games');

    // Apply filters
    if (search) {
      query = query.where('name', 'like', `%${search}%`);
    }

    if (genre) {
      query = query.join('game_genres', 'games.id', 'game_genres.game_id')
                   .join('genres', 'game_genres.genre_id', 'genres.id')
                   .where('genres.slug', genre);
    }

    // Get the total count separately
    const totalResult = await query.clone().count('* as count').first();
    const total = totalResult.count;

    // Fetch the games with specific columns
    const games = await query
      .select(
        'games.id', 'games.name', 'games.slug', 'games.description', 'games.released',
        'games.background_image', 'games.rating', 'games.metacritic_score', 'games.playtime'
      )
      .orderBy(
        ordering.startsWith('-') ? ordering.slice(1) : ordering,
        ordering.startsWith('-') ? 'desc' : 'asc'
      )
      .limit(limit)
      .offset(offset);

    // Fetch genres for each game
    for (let game of games) {
      game.genres = await db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('game_genres.game_id', game.id)
        .select('genres.id', 'genres.name', 'genres.slug');
    }

    res.json({
      games,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total)
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await db('games')
      .where({ id: req.params.id })
      .select(
        'id', 'name', 'slug', 'description', 'released', 
        'background_image', 'rating', 'metacritic_score', 'playtime'
      )
      .first();
    
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Fetch related data
    game.genres = await db('game_genres')
      .join('genres', 'game_genres.genre_id', 'genres.id')
      .where('game_genres.game_id', game.id)
      .select('genres.id', 'genres.name', 'genres.slug');

    game.publishers = await db('game_publishers')
      .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
      .where('game_publishers.game_id', game.id)
      .select('publishers.id', 'publishers.name', 'publishers.slug');

    game.developers = await db('game_developers')
      .join('developers', 'game_developers.developer_id', 'developers.id')
      .where('game_developers.game_id', game.id)
      .select('developers.id', 'developers.name', 'developers.slug');

    game.platforms = await db('game_platforms')
      .join('platforms', 'game_platforms.platform_id', 'platforms.id')
      .where('game_platforms.game_id', game.id)
      .select('platforms.id', 'platforms.name', 'platforms.slug');

    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User Games Routes
app.get('/api/user/games', verifyToken, async (req, res) => {
  try {
    const { status } = req.query;
    let query = db('user_game_lists')
      .join('games', 'user_game_lists.game_id', 'games.id')
      .where('user_game_lists.user_id', req.userId)
      .select(
        'games.id', 'games.name', 'games.slug', 'games.background_image', 
        'games.rating', 'user_game_lists.status', 'user_game_lists.score', 
        'user_game_lists.progress_hours'
      );

    if (status) {
      query = query.where('user_game_lists.status', status);
    }

    const games = await query;
    
    // Fetch genres for each game
    for (let game of games) {
      game.genres = await db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('game_genres.game_id', game.id)
        .select('genres.id', 'genres.name', 'genres.slug');
    }

    res.json({ games });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/user/games/:id', verifyToken, async (req, res) => {
  try {
    const { status, score, progress_hours } = req.body;
    const gameId = req.params.id;

    const game = await db('games').where({ id: gameId }).first();
    if (!game) return res.status(404).json({ error: 'Game not found' });

    await db('user_game_lists')
      .insert({
        user_id: req.userId,
        game_id: gameId,
        status,
        score: score || null,
        progress_hours: progress_hours || 0
      })
      .onConflict(['user_id', 'game_id'])
      .merge();

    res.json({ message: 'Game added/updated successfully' });
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

// Genres Route
app.get('/api/genres', async (req, res) => {
  try {
    const genres = await db('genres').select('id', 'name', 'slug');
    res.json({ genres });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Stats Route
app.get('/api/stats', async (req, res) => {
  try {
    const totalGames = await db('games').count('* as count').first();
    const totalUsers = await db('users').count('* as count').first();
    
    res.json({
      stats: {
        total_games: parseInt(totalGames.count),
        total_users: parseInt(totalUsers.count)
      }
    });
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