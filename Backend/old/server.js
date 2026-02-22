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

// =============================================
// MIDDLEWARE
// =============================================

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

// Middleware to check if user is banned
const checkBanned = async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.userId }).first();
    if (user && user.is_banned) {
      return res.status(403).json({ 
        error: 'Your account has been banned',
        bannedAt: user.banned_at,
        reason: user.ban_reason 
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Middleware to check if user is moderator (includes admin)
const verifyModerator = async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.userId }).first();
    
    if (!user || !user.is_moderator) {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    
    req.userRole = {
      isModerator: true,
      isAdmin: user.is_admin || false
    };
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Middleware to check if user is admin ONLY
const verifyAdmin = async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.userId }).first();
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Activity logging helper
async function logModeratorActivity(moderatorId, actionType, targetType, targetId, details = null) {
  try {
    await db('moderator_activity').insert({
      moderator_id: moderatorId,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      details: details
    });
  } catch (error) {
    console.error('Activity logging error:', error);
  }
}

// =============================================
// AUTHENTICATION ROUTES
// =============================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, display_name, password } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if username or email already exists
    const existingUser = await db('users')
      .where({ username })
      .orWhere({ email })
      .first();
    
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.username === username ? 'Username already exists' : 'Email already exists' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [userId] = await db('users').insert({
      username,
      email,
      display_name: display_name || username,
      password_hash: hashedPassword,
      is_admin: false,
      is_moderator: false,
      is_banned: false
    });
    
    const user = await db('users')
      .where({ id: userId })
      .select('id', 'username', 'email', 'display_name', 'is_admin', 'is_moderator', 'avatar_url')
      .first();
      
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = await db('users').where({ username }).first();
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ 
        error: 'Your account has been banned',
        bannedAt: user.banned_at,
        reason: user.ban_reason
      });
    }
    
    // Update last login
    await db('users').where({ id: user.id }).update({ 
      last_login: db.fn.now() 
    });
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        is_moderator: user.is_moderator || false,
        is_admin: user.is_admin || false
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/auth/me', verifyToken, checkBanned, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.userId })
      .select('id', 'username', 'email', 'display_name', 'avatar_url', 'is_moderator', 'is_admin')
      .first();
      
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// GAMES ROUTES
// =============================================

app.get('/api/games', async (req, res) => {
  try {
    const { 
      search, 
      releaseYear, 
      publisher, 
      developer, 
      platform, 
      genre, 
      limit = 20, 
      offset = 0, 
      sort = 'rating',
      order = 'desc'
    } = req.query;

    // Build base query
    let query = db('games')
      .select(
        'games.id',
        'games.name',
        'games.background_image',
        'games.rating',
        'games.description',
        db.raw("DATE_FORMAT(games.released, '%Y') as release_year"),
        'games.released'
      );

    // Apply filters
    if (search) {
      query = query.where('games.name', 'like', `%${search}%`);
    }

    if (releaseYear) {
      query = query.whereRaw('YEAR(games.released) = ?', [releaseYear]);
    }

    if (publisher) {
      query = query
        .join('game_publishers', 'games.id', 'game_publishers.game_id')
        .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
        .where('publishers.name', publisher);
    }

    if (developer) {
      query = query
        .join('game_developers', 'games.id', 'game_developers.game_id')
        .join('developers', 'game_developers.developer_id', 'developers.id')
        .where('developers.name', developer);
    }

    if (platform) {
      query = query
        .join('game_platforms', 'games.id', 'game_platforms.game_id')
        .join('platforms', 'game_platforms.platform_id', 'platforms.id')
        .where('platforms.name', platform);
    }

    if (genre) {
      query = query
        .join('game_genres', 'games.id', 'game_genres.game_id')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('genres.name', genre);
    }

    // Validate and apply sorting
        const sortOrder = order.toLowerCase() === 'asc' ? 'asc' : 'desc';

    switch (sort) {
      case 'name':
        query = query.orderBy('games.name', sortOrder);
        break;
      case 'release':
        query = query.orderBy('games.released', sortOrder);
        break;
      case 'created_at':
        // NEW: Sort by time added to database
        query = query.orderBy('games.created_at', sortOrder);
        break;
      case 'id':
        // NEW: Sort by game ID
        query = query.orderBy('games.id', sortOrder);
        break;
      case 'rating':
      default:
        query = query.orderBy('games.rating', sortOrder);
        if (sortOrder === 'desc') {
          query = query.orderBy('games.name', 'asc');
        }
        break;
    }
    
    // Group by to avoid duplicates from joins
    query = query.groupBy('games.id');

    // Apply pagination
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    
    if (parsedLimit > 0) {
      query = query.limit(parsedLimit).offset(parsedOffset);
    }

    // Build count query with same filters
    let countQuery = db('games').count('games.id as total');
    
    if (search) {
      countQuery = countQuery.where('games.name', 'like', `%${search}%`);
    }
    if (releaseYear) {
      countQuery = countQuery.whereRaw('YEAR(games.released) = ?', [releaseYear]);
    }
    if (publisher) {
      countQuery = countQuery
        .join('game_publishers', 'games.id', 'game_publishers.game_id')
        .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
        .where('publishers.name', publisher);
    }
    if (developer) {
      countQuery = countQuery
        .join('game_developers', 'games.id', 'game_developers.game_id')
        .join('developers', 'game_developers.developer_id', 'developers.id')
        .where('developers.name', developer);
    }
    if (platform) {
      countQuery = countQuery
        .join('game_platforms', 'games.id', 'game_platforms.game_id')
        .join('platforms', 'game_platforms.platform_id', 'platforms.id')
        .where('platforms.name', platform);
    }
    if (genre) {
      countQuery = countQuery
        .join('game_genres', 'games.id', 'game_genres.game_id')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('genres.name', genre);
    }

    const [games, totalResult] = await Promise.all([
      query,
      countQuery.first()
    ]);

    const total = totalResult?.total || 0;
    const gameIds = games.map(game => game.id);

    if (gameIds.length === 0) {
      return res.json({ 
        games: [], 
        total: 0,
        hasMore: false 
      });
    }

    // Fetch related data in batch
    const [genres, publishers, developers, platforms] = await Promise.all([
      db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .whereIn('game_genres.game_id', gameIds)
        .select('game_genres.game_id', 'genres.id', 'genres.name'),
      
      db('game_publishers')
        .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
        .whereIn('game_publishers.game_id', gameIds)
        .select('game_publishers.game_id', 'publishers.id', 'publishers.name'),
      
      db('game_developers')
        .join('developers', 'game_developers.developer_id', 'developers.id')
        .whereIn('game_developers.game_id', gameIds)
        .select('game_developers.game_id', 'developers.id', 'developers.name'),
      
      db('game_platforms')
        .join('platforms', 'game_platforms.platform_id', 'platforms.id')
        .whereIn('game_platforms.game_id', gameIds)
        .select('game_platforms.game_id', 'platforms.id', 'platforms.name')
    ]);

    // Map related data to games
    games.forEach(game => {
      game.genres = genres.filter(g => g.game_id === game.id).map(g => ({ id: g.id, name: g.name }));
      game.publishers = publishers.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
      game.developers = developers.filter(d => d.game_id === game.id).map(d => ({ id: d.id, name: d.name }));
      game.platforms = platforms.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
    });

    res.json({ 
      games,
      total,
      hasMore: parsedLimit > 0 && (parsedOffset + parsedLimit) < total
    });
  } catch (error) {
    console.error('Games API Error:', error);
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
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Fetch related data
    const [genres, publishers, developers, platforms] = await Promise.all([
      db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .where('game_genres.game_id', game.id)
        .select('genres.id', 'genres.name'),
      
      db('game_publishers')
        .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
        .where('game_publishers.game_id', game.id)
        .select('publishers.id', 'publishers.name'),
      
      db('game_developers')
        .join('developers', 'game_developers.developer_id', 'developers.id')
        .where('game_developers.game_id', game.id)
        .select('developers.id', 'developers.name'),
      
      db('game_platforms')
        .join('platforms', 'game_platforms.platform_id', 'platforms.id')
        .where('game_platforms.game_id', game.id)
        .select('platforms.id', 'platforms.name')
    ]);

    game.genres = genres;
    game.publishers = publishers;
    game.developers = developers;
    game.platforms = platforms;

    res.json(game);
  } catch (error) {
    console.error('Game Details API Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// USER GAMES ROUTES
// =============================================

app.get('/api/user/games', verifyToken, checkBanned, async (req, res) => {
  try {
    const games = await db('user_game_lists')
      .join('games', 'user_game_lists.game_id', 'games.id')
      .where('user_game_lists.user_id', req.userId)
      .select(
        'games.id', 
        'games.name', 
        'games.background_image',
        'games.rating',
        'user_game_lists.status',
        'user_game_lists.score',
        'user_game_lists.progress_hours',
        'user_game_lists.created_at',
        'user_game_lists.updated_at'
      )
      .orderBy('user_game_lists.updated_at', 'desc');

    const gameIds = games.map(game => game.id);
    
    if (gameIds.length > 0) {
      const genres = await db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .whereIn('game_genres.game_id', gameIds)
        .select('game_genres.game_id', 'genres.name');
      
      games.forEach(game => {
        game.genres = genres.filter(g => g.game_id === game.id).map(g => g.name);
      });
    }

    res.json({ games });
  } catch (error) {
    console.error('User Games API Error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/user/games/:id', verifyToken, checkBanned, async (req, res) => {
  try {
    const { status, score } = req.body;
    const gameId = req.params.id;

    const game = await db('games').where({ id: gameId }).first();
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

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
    console.error('Add Game API Error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/user/games/:id', verifyToken, checkBanned, async (req, res) => {
  try {
    const { status, score, progress_hours } = req.body;
    const gameId = req.params.id;

    const existingEntry = await db('user_game_lists')
      .where({ user_id: req.userId, game_id: gameId })
      .first();
      
    if (!existingEntry) {
      return res.status(404).json({ error: 'Game not in your list' });
    }

    await db('user_game_lists')
      .where({ user_id: req.userId, game_id: gameId })
      .update({
        status: status !== undefined ? status : existingEntry.status,
        score: score !== undefined ? score : existingEntry.score,
        progress_hours: progress_hours !== undefined ? progress_hours : existingEntry.progress_hours,
        updated_at: db.fn.now()
      });

    res.json({ message: 'Game updated successfully' });
  } catch (error) {
    console.error('Update Game API Error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/user/games/:id', verifyToken, checkBanned, async (req, res) => {
  try {
    const deleted = await db('user_game_lists')
      .where({ user_id: req.userId, game_id: req.params.id })
      .delete();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Game not found in your list' });
    }
    
    res.json({ message: 'Game removed successfully' });
  } catch (error) {
    console.error('Delete Game API Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// USER PROFILE ROUTES
// =============================================

app.get('/api/user/profile', verifyToken, checkBanned, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.userId })
      .select('id', 'username', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at')
      .first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/user/profile', verifyToken, checkBanned, async (req, res) => {
  try {
    const { display_name, email, avatar_url } = req.body;
    
    if (!display_name || !email) {
      return res.status(400).json({ error: 'Display name and email are required' });
    }
    
    const existingUser = await db('users')
      .where({ email })
      .whereNot({ id: req.userId })
      .first();
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    await db('users')
      .where({ id: req.userId })
      .update({
        display_name,
        email,
        avatar_url: avatar_url || null,
        updated_at: db.fn.now()
      });
    
    const user = await db('users')
      .where({ id: req.userId })
      .select('id', 'username', 'email', 'display_name', 'avatar_url', 'created_at', 'updated_at')
      .first();
    
    res.json({ 
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/user/password', verifyToken, checkBanned, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const user = await db('users')
      .where({ id: req.userId })
      .select('password_hash')
      .first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isValidPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    await db('users')
      .where({ id: req.userId })
      .update({ password_hash: hashedPassword });
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =============================================
// FOLLOW SYSTEM
// =============================================

app.get('/api/users/search', verifyToken, checkBanned, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.json({ users: [] });
    }
    
    const users = await db('users')
      .where(function() {
        this.where('username', 'like', `%${query}%`)
            .orWhere('display_name', 'like', `%${query}%`);
      })
      .where('is_banned', false)
      .whereNot('id', req.userId)
      .select('id', 'username', 'display_name', 'avatar_url')
      .limit(10);
    
    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/following', verifyToken, checkBanned, async (req, res) => {
  try {
    const following = await db('user_follows')
      .join('users', 'user_follows.following_id', 'users.id')
      .where('user_follows.follower_id', req.userId)
      .where('users.is_banned', false)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
        'user_follows.created_at as followed_since'
      )
      .orderBy('user_follows.created_at', 'desc');
    
    res.json({ following });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/followers', verifyToken, checkBanned, async (req, res) => {
  try {
    const followers = await db('user_follows')
      .join('users', 'user_follows.follower_id', 'users.id')
      .where('user_follows.following_id', req.userId)
      .where('users.is_banned', false)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
        'user_follows.created_at as followed_since'
      )
      .orderBy('user_follows.created_at', 'desc');
    
    res.json({ followers });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/follow/:userId', verifyToken, checkBanned, async (req, res) => {
  try {
    const followingId = parseInt(req.params.userId);
    
    if (followingId === req.userId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    const user = await db('users').where({ id: followingId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.is_banned) {
      return res.status(400).json({ error: 'Cannot follow a banned user' });
    }
    
    const existingFollow = await db('user_follows')
      .where({
        follower_id: req.userId,
        following_id: followingId
      })
      .first();
    
    if (existingFollow) {
      return res.status(400).json({ error: 'Already following this user' });
    }
    
    await db('user_follows').insert({
      follower_id: req.userId,
      following_id: followingId
    });
    
    res.json({ message: 'User followed successfully' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/follow/:userId', verifyToken, checkBanned, async (req, res) => {
  try {
    const followingId = parseInt(req.params.userId);
    
    const deleted = await db('user_follows')
      .where({
        follower_id: req.userId,
        following_id: followingId
      })
      .delete();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Not following this user' });
    }
    
    res.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/follow/status/:userId', verifyToken, checkBanned, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const [following, followsYou] = await Promise.all([
      db('user_follows')
        .where({
          follower_id: req.userId,
          following_id: userId
        })
        .first(),
      db('user_follows')
        .where({
          follower_id: userId,
          following_id: req.userId
        })
        .first()
    ]);
    
    res.json({ 
      isFollowing: !!following,
      followsYou: !!followsYou
    });
  } catch (error) {
    console.error('Check follow status error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:userId', verifyToken, checkBanned, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const user = await db('users')
      .where({ id: userId })
      .where('is_banned', false)
      .select('id', 'username', 'display_name', 'avatar_url', 'created_at')
      .first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const [games, followers, following] = await Promise.all([
      db('user_game_lists').where('user_id', userId).count('id as count').first(),
      db('user_follows').where('following_id', userId).count('* as count').first(),
      db('user_follows').where('follower_id', userId).count('* as count').first()
    ]);
    
    res.json({ 
      user: {
        ...user,
        totalGames: games.count || 0,
        followersCount: followers.count || 0,
        followingCount: following.count || 0
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:userId/games', verifyToken, checkBanned, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const user = await db('users').where({ id: userId, is_banned: false }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const games = await db('user_game_lists')
      .join('games', 'user_game_lists.game_id', 'games.id')
      .where('user_game_lists.user_id', userId)
      .select(
        'games.id',
        'games.name',
        'games.background_image',
        'games.rating',
        'user_game_lists.status',
        'user_game_lists.score',
        'user_game_lists.progress_hours'
      )
      .orderBy('user_game_lists.updated_at', 'desc');
    
    const gameIds = games.map(game => game.id);
    
    if (gameIds.length > 0) {
      const genres = await db('game_genres')
        .join('genres', 'game_genres.genre_id', 'genres.id')
        .whereIn('game_genres.game_id', gameIds)
        .select('game_genres.game_id', 'genres.name');
      
      games.forEach(game => {
        game.genres = genres.filter(g => g.game_id === game.id).map(g => g.name);
      });
    }
    
    res.json({ games });
  } catch (error) {
    console.error('Get user games error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:userId/followers', verifyToken, checkBanned, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const followers = await db('user_follows')
      .join('users', 'user_follows.follower_id', 'users.id')
      .where('user_follows.following_id', userId)
      .where('users.is_banned', false)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url'
      )
      .orderBy('user_follows.created_at', 'desc');
    
    res.json({ followers });
  } catch (error) {
    console.error('Get user followers error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:userId/following', verifyToken, checkBanned, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const following = await db('user_follows')
      .join('users', 'user_follows.following_id', 'users.id')
      .where('user_follows.follower_id', userId)
      .where('users.is_banned', false)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url'
      )
      .orderBy('user_follows.created_at', 'desc');
    
    res.json({ following });
  } catch (error) {
    console.error('Get user following error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// ADMIN/MODERATOR ROUTES
// =============================================

// Get all users (Moderators and Admins)
app.get('/api/admin/users', verifyToken, verifyModerator, async (req, res) => {
  try {
    const { search, limit = 100, offset = 0 } = req.query;
    
    let query = db('users')
      .select(
        'id', 'username', 'email', 'display_name', 'avatar_url', 
        'created_at', 'is_moderator', 'is_admin', 'is_banned', 'banned_at', 'ban_reason'
      );
    
    if (search) {
      query = query.where(function() {
        this.where('username', 'like', `%${search}%`)
            .orWhere('email', 'like', `%${search}%`)
            .orWhere('display_name', 'like', `%${search}%`);
      });
    }
    
    const [users, countResult] = await Promise.all([
      query.limit(parseInt(limit)).offset(parseInt(offset)).orderBy('created_at', 'desc'),
      db('users').count('id as total').first()
    ]);
    
    res.json({ 
      users,
      total: countResult.total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/users/:id', verifyToken, verifyModerator, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.params.id })
      .select(
        'id', 'username', 'email', 'display_name', 'avatar_url', 
        'created_at', 'updated_at', 'is_moderator', 'is_admin', 'is_banned', 'banned_at', 'ban_reason'
      )
      .first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const gameCount = await db('user_game_lists')
      .where('user_id', user.id)
      .count('id as count')
      .first();
    
    user.totalGames = gameCount.count;
    
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Ban user (Moderators can ban, but not other moderators)
app.put('/api/admin/users/:id/ban', verifyToken, verifyModerator, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { reason } = req.body;
    
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot ban yourself' });
    }
    
    const user = await db('users').where({ id: userId }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Moderators cannot ban other moderators
    if (user.is_moderator && !req.userRole.isAdmin) {
      return res.status(403).json({ error: 'Cannot ban a moderator' });
    }
    
    if (user.is_banned) {
      return res.status(400).json({ error: 'User is already banned' });
    }
    
    await db.transaction(async (trx) => {
      await trx('users')
        .where({ id: userId })
        .update({
          is_banned: true,
          banned_at: trx.fn.now(),
          banned_by: req.userId,
          ban_reason: reason || null
        });
      
      await trx('ban_history').insert({
        user_id: userId,
        banned_by: req.userId,
        ban_reason: reason || null
      });
    });
    
    await logModeratorActivity(
      req.userId, 
      'ban_user', 
      'user', 
      userId, 
      reason || 'No reason provided'
    );
    
    res.json({ message: 'User banned successfully' });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Unban user (Moderators and Admins)
app.put('/api/admin/users/:id/unban', verifyToken, verifyModerator, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const user = await db('users').where({ id: userId }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.is_banned) {
      return res.status(400).json({ error: 'User is not banned' });
    }
    
    await db.transaction(async (trx) => {
      await trx('users')
        .where({ id: userId })
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
          ban_reason: null
        });
      
      await trx('ban_history')
        .where({ user_id: userId })
        .whereNull('unbanned_at')
        .update({
          unbanned_at: trx.fn.now(),
          unbanned_by: req.userId
        });
    });
    
    await logModeratorActivity(
      req.userId, 
      'unban_user', 
      'user', 
      userId, 
      `Unbanned ${user.username}`
    );
    
    res.json({ message: 'User unbanned successfully' });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get ban history for a user
app.get('/api/admin/users/:id/ban-history', verifyToken, verifyModerator, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const history = await db('ban_history')
      .leftJoin('users as banner', 'ban_history.banned_by', 'banner.id')
      .leftJoin('users as unbanner', 'ban_history.unbanned_by', 'unbanner.id')
      .where('ban_history.user_id', userId)
      .select(
        'ban_history.*',
        'banner.username as banned_by_username',
        'unbanner.username as unbanned_by_username'
      )
      .orderBy('ban_history.banned_at', 'desc');
    
    res.json({ history });
  } catch (error) {
    console.error('Get ban history error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get all moderators (Admin only)
app.get('/api/admin/moderators', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = db('users')
      .where('is_moderator', true)
      .select('id', 'username', 'email', 'display_name', 'is_admin', 'last_login', 'created_at');
    
    if (search) {
      query = query.where(function() {
        this.where('username', 'like', `%${search}%`)
            .orWhere('email', 'like', `%${search}%`);
      });
    }
    
    const moderators = await query.orderBy('created_at', 'desc');
    
    // Get action counts for each moderator
    const moderatorIds = moderators.map(m => m.id);
    if (moderatorIds.length > 0) {
      const activityCounts = await db('moderator_activity')
        .whereIn('moderator_id', moderatorIds)
        .whereRaw('DATE(created_at) = CURDATE()')
        .select('moderator_id')
        .count('id as actions_count')
        .groupBy('moderator_id');
      
      const countMap = {};
      activityCounts.forEach(ac => {
        countMap[ac.moderator_id] = ac.actions_count;
      });
      
      moderators.forEach(mod => {
        mod.actions_count = countMap[mod.id] || 0;
      });
    }
    
    res.json({ moderators });
  } catch (error) {
    console.error('Get moderators error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Promote user to moderator (Admin only)
app.put('/api/admin/users/:id/promote', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const user = await db('users').where({ id: userId }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.is_moderator) {
      return res.status(400).json({ error: 'User is already a moderator' });
    }
    
    await db('users').where({ id: userId }).update({ is_moderator: true });
    
    await logModeratorActivity(
      req.userId, 
      'promote_moderator', 
      'user', 
      userId, 
      `Promoted ${user.username} to moderator`
    );
    
    res.json({ message: 'User promoted to moderator successfully' });
  } catch (error) {
    console.error('Promote moderator error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Demote moderator to user (Admin only)
app.put('/api/admin/users/:id/demote', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot demote yourself' });
    }
    
    const user = await db('users').where({ id: userId }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.is_admin) {
      return res.status(403).json({ error: 'Cannot demote an admin' });
    }
    
    if (!user.is_moderator) {
      return res.status(400).json({ error: 'User is not a moderator' });
    }
    
    await db('users').where({ id: userId }).update({ is_moderator: false });
    
    await logModeratorActivity(
      req.userId, 
      'demote_moderator', 
      'user', 
      userId, 
      `Demoted ${user.username} from moderator`
    );
    
    res.json({ message: 'Moderator demoted successfully' });
  } catch (error) {
    console.error('Demote moderator error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete user permanently (Admin only)
app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const user = await db('users').where({ id: userId }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.is_admin) {
      return res.status(403).json({ error: 'Cannot delete an admin' });
    }
    
    await db.transaction(async (trx) => {
      await trx('user_game_lists').where('user_id', userId).delete();
      await trx('user_follows').where('follower_id', userId).orWhere('following_id', userId).delete();
      await trx('ban_history').where('user_id', userId).delete();
      await trx('moderator_activity').where('moderator_id', userId).delete();
      await trx('users').where('id', userId).delete();
    });
    
    await logModeratorActivity(
      req.userId, 
      'delete_user', 
      'user', 
      userId, 
      `Permanently deleted ${user.username}`
    );
    
    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get moderator activity log (Admin sees all, Moderators see own)
app.get('/api/admin/activity', verifyToken, verifyModerator, async (req, res) => {
  try {
    const { limit = 50, offset = 0, action_type } = req.query;
    const isAdmin = req.userRole.isAdmin;
    
    let query = db('moderator_activity')
      .leftJoin('users as moderator', 'moderator_activity.moderator_id', 'moderator.id')
      .leftJoin('users as target_user', function() {
        this.on('moderator_activity.target_id', 'target_user.id')
            .andOn(db.raw("moderator_activity.target_type = 'user'"));
      })
      .leftJoin('games as target_game', function() {
        this.on('moderator_activity.target_id', 'target_game.id')
            .andOn(db.raw("moderator_activity.target_type = 'game'"));
      })
      .select(
        'moderator_activity.*',
        'moderator.username as moderator_username',
        'target_user.username as target_username',
        'target_game.name as target_name'
      );
    
    // If not admin, only show own activity
    if (!isAdmin) {
      query = query.where('moderator_activity.moderator_id', req.userId);
    }
    
    if (action_type) {
      query = query.where('moderator_activity.action_type', action_type);
    }
    
    const activities = await query
      .orderBy('moderator_activity.created_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    res.json({ activities });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Add game with logging (Moderators and Admins)
app.post('/api/admin/games', verifyToken, verifyModerator, async (req, res) => {
  try {
    const { 
      name, 
      slug,
      description, 
      background_image, 
      rating, 
      metacritic_score, 
      playtime, 
      released,
      genres,
      platforms,
      publishers,
      developers
    } = req.body;
    
    if (!name || !released) {
      return res.status(400).json({ error: 'Name and release date are required' });
    }
    
    const createSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const gameData = await db.transaction(async (trx) => {
      // Insert the game
      const [gameId] = await trx('games').insert({
        name,
        slug: slug || createSlug(name),
        description: description || null,
        background_image: background_image || null,
        rating: rating || null,
        metacritic_score: metacritic_score || null,
        playtime: playtime || null,
        released
      });
      
      // Process genres
      if (genres && genres.length > 0) {
        for (const genreName of genres) {
          const genreSlug = createSlug(genreName);
          
          let genre = await trx('genres').where({ slug: genreSlug }).first();
          
          if (!genre) {
            const [genreId] = await trx('genres').insert({
              name: genreName,
              slug: genreSlug
            });
            genre = { id: genreId };
          }
          
          await trx('game_genres').insert({
            game_id: gameId,
            genre_id: genre.id
          }).onConflict(['game_id', 'genre_id']).ignore();
        }
      }
      
      // Process platforms
      if (platforms && platforms.length > 0) {
        for (const platformName of platforms) {
          const platformSlug = createSlug(platformName);
          
          let platform = await trx('platforms').where({ slug: platformSlug }).first();
          
          if (!platform) {
            const [platformId] = await trx('platforms').insert({
              name: platformName,
              slug: platformSlug
            });
            platform = { id: platformId };
          }
          
          await trx('game_platforms').insert({
            game_id: gameId,
            platform_id: platform.id
          }).onConflict(['game_id', 'platform_id']).ignore();
        }
      }
      
      // Process publishers
      if (publishers && publishers.length > 0) {
        for (const publisherName of publishers) {
          const publisherSlug = createSlug(publisherName);
          
          let publisher = await trx('publishers').where({ slug: publisherSlug }).first();
          
          if (!publisher) {
            const [publisherId] = await trx('publishers').insert({
              name: publisherName,
              slug: publisherSlug
            });
            publisher = { id: publisherId };
          }
          
          await trx('game_publishers').insert({
            game_id: gameId,
            publisher_id: publisher.id
          }).onConflict(['game_id', 'publisher_id']).ignore();
        }
      }
      
      // Process developers
      if (developers && developers.length > 0) {
        for (const developerName of developers) {
          const developerSlug = createSlug(developerName);
          
          let developer = await trx('developers').where({ slug: developerSlug }).first();
          
          if (!developer) {
            const [developerId] = await trx('developers').insert({
              name: developerName,
              slug: developerSlug
            });
            developer = { id: developerId };
          }
          
          await trx('game_developers').insert({
            game_id: gameId,
            developer_id: developer.id
          }).onConflict(['game_id', 'developer_id']).ignore();
        }
      }
      
      return { gameId, name };
    });
    
    await logModeratorActivity(
      req.userId, 
      'add_game', 
      'game', 
      gameData.gameId, 
      `Added manually`
    );
    
    res.json({ 
      message: 'Game added successfully',
      gameId: gameData.gameId
    });
  } catch (error) {
    console.error('Add game error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Seed games from RAWG API (Moderators and Admins) - FIXED VERSION
// =============================================
// CORRECTED SEED GAMES ENDPOINT WITH ACTIVITY LOGGING
// Replace your existing seed-games endpoint with this
// =============================================
app.post('/api/admin/seed-games', verifyToken, verifyModerator, async (req, res) => {
  try {
    const { startPage = 1, pageCount = 5 } = req.body;
    
    // Validate input
    if (startPage < 1) {
      return res.status(400).json({ error: 'Start page must be at least 1' });
    }
    
    if (pageCount < 1) {
      return res.status(400).json({ error: 'Page count must be at least 1' });
    }
    
    const RAWG_API_KEY = process.env.RAWG_API_KEY;
    
    if (!RAWG_API_KEY) {
      return res.status(500).json({ 
        error: 'RAWG API key not configured. Please add RAWG_API_KEY to your .env file' 
      });
    }
    
    let totalGames = 0;
    let successfulInserts = 0;
    let duplicateGames = 0;
    let failedGames = 0;
    let addedGames = [];
    
    const createSlug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    // Dynamic import for node-fetch
    let fetch;
    try {
      fetch = globalThis.fetch;
    } catch {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
    // Helper function to fetch detailed game data
    const fetchGameDetails = async (gameId) => {
      try {
        const response = await fetch(
          `https://api.rawg.io/api/games/${gameId}?key=${RAWG_API_KEY}`
        );
        
        if (!response.ok) {
          console.error(`Failed to fetch details for game ${gameId}: ${response.status}`);
          return null;
        }
        
        return await response.json();
      } catch (error) {
        console.error(`Error fetching game details for ${gameId}:`, error.message);
        return null;
      }
    };
    
    // Fetch games from RAWG API
    for (let page = startPage; page < startPage + pageCount; page++) {
      try {
        console.log(`Fetching page ${page}...`);
        const response = await fetch(
          `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&page=${page}&page_size=40`
        );
        
        if (!response.ok) {
          console.error(`Failed to fetch page ${page}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const games = data.results || [];
        totalGames += games.length;
        
        // Process each game
        for (let i = 0; i < games.length; i++) {
          const gameBasic = games[i];
          
          try {
            console.log(`Processing game ${i + 1}/${games.length}: ${gameBasic.name}`);
            
            const gameSlug = createSlug(gameBasic.slug || gameBasic.name);
            
            // Check if game already exists
            const existingGame = await db('games')
              .where({ slug: gameSlug })
              .first();
            
            if (existingGame) {
              console.log(`Game ${gameBasic.name} already exists, skipping...`);
              duplicateGames++;
              continue;
            }
            
            // Fetch full game details
            console.log(`Fetching full details for ${gameBasic.name}...`);
            const gameDetails = await fetchGameDetails(gameBasic.id);
            
            if (!gameDetails) {
              console.log(`Could not fetch details for ${gameBasic.name}, skipping...`);
              failedGames++;
              continue;
            }
            
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Insert game with full details in transaction
            await db.transaction(async (trx) => {
              // Insert the game
              const [gameId] = await trx('games').insert({
                name: gameDetails.name,
                slug: gameSlug,
                description: gameDetails.description_raw || gameDetails.description || null,
                background_image: gameDetails.background_image || null,
                rating: gameDetails.rating || null,
                metacritic_score: gameDetails.metacritic || null,
                playtime: gameDetails.playtime || null,
                released: gameDetails.released || null
              });
              
              // Process genres
              if (gameDetails.genres && gameDetails.genres.length > 0) {
                for (const genreData of gameDetails.genres) {
                  const genreSlug = createSlug(genreData.slug || genreData.name);
                  
                  let genre = await trx('genres').where({ slug: genreSlug }).first();
                  
                  if (!genre) {
                    const [genreId] = await trx('genres').insert({
                      name: genreData.name,
                      slug: genreSlug
                    });
                    genre = { id: genreId };
                  }
                  
                  await trx('game_genres').insert({
                    game_id: gameId,
                    genre_id: genre.id
                  }).onConflict(['game_id', 'genre_id']).ignore();
                }
              }
              
              // Process platforms
              if (gameDetails.platforms && gameDetails.platforms.length > 0) {
                for (const platformData of gameDetails.platforms) {
                  const platformInfo = platformData.platform;
                  const platformSlug = createSlug(platformInfo.slug || platformInfo.name);
                  
                  let platform = await trx('platforms').where({ slug: platformSlug }).first();
                  
                  if (!platform) {
                    const [platformId] = await trx('platforms').insert({
                      name: platformInfo.name,
                      slug: platformSlug
                    });
                    platform = { id: platformId };
                  }
                  
                  await trx('game_platforms').insert({
                    game_id: gameId,
                    platform_id: platform.id
                  }).onConflict(['game_id', 'platform_id']).ignore();
                }
              }
              
              // Process publishers
              if (gameDetails.publishers && gameDetails.publishers.length > 0) {
                for (const publisherData of gameDetails.publishers) {
                  const publisherSlug = createSlug(publisherData.slug || publisherData.name);
                  
                  let publisher = await trx('publishers').where({ slug: publisherSlug }).first();
                  
                  if (!publisher) {
                    const [publisherId] = await trx('publishers').insert({
                      name: publisherData.name,
                      slug: publisherSlug
                    });
                    publisher = { id: publisherId };
                  }
                  
                  await trx('game_publishers').insert({
                    game_id: gameId,
                    publisher_id: publisher.id
                  }).onConflict(['game_id', 'publisher_id']).ignore();
                }
              }
              
              // Process developers
              if (gameDetails.developers && gameDetails.developers.length > 0) {
                for (const developerData of gameDetails.developers) {
                  const developerSlug = createSlug(developerData.slug || developerData.name);
                  
                  let developer = await trx('developers').where({ slug: developerSlug }).first();
                  
                  if (!developer) {
                    const [developerId] = await trx('developers').insert({
                      name: developerData.name,
                      slug: developerSlug
                    });
                    developer = { id: developerId };
                  }
                  
                  await trx('game_developers').insert({
                    game_id: gameId,
                    developer_id: developer.id
                  }).onConflict(['game_id', 'developer_id']).ignore();
                }
              }
            });
            
            successfulInserts++;
            addedGames.push(gameDetails.name);
            console.log(`✓ Successfully added: ${gameDetails.name}`);
            
          } catch (gameError) {
            console.error(`Failed to insert game ${gameBasic.name}:`, gameError);
            failedGames++;
          }
        }
        
        // Add delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (pageError) {
        console.error(`Error processing page ${page}:`, pageError);
      }
    }
    
    // ============================================
    // CRITICAL: LOG THE ACTIVITY BEFORE SENDING RESPONSE
    // ============================================
    console.log('LOGGING ACTIVITY - User ID:', req.userId);
    
    await logModeratorActivity(
      req.userId,
      'seed_games',
      'game',
      0,
      `Pages: ${startPage} to ${startPage + pageCount - 1} | Added: ${successfulInserts} games`
    );
    
    console.log('ACTIVITY LOGGED SUCCESSFULLY');
    
    // ============================================
    // NOW SEND THE RESPONSE
    // ============================================
    res.json({
      totalGames,
      successfulInserts,
      duplicateGames,
      failedGames,
      addedGames,
      message: `Successfully seeded ${successfulInserts} games with complete data`
    });
    
  } catch (error) {
    console.error('Seed games error:', error);
    res.status(500).json({ error: error.message || 'Failed to seed games' });
  }
});

// Update game with logging (Moderators and Admins)
app.put('/api/admin/games/:id', verifyToken, verifyModerator, async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { 
      name, 
      description, 
      background_image, 
      rating, 
      metacritic_score, 
      playtime, 
      released 
    } = req.body;
    
    const game = await db('games').where({ id: gameId }).first();
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    await db('games')
      .where({ id: gameId })
      .update({
        name: name !== undefined ? name : game.name,
        description: description !== undefined ? description : game.description,
        background_image: background_image !== undefined ? background_image : game.background_image,
        rating: rating !== undefined ? rating : game.rating,
        metacritic_score: metacritic_score !== undefined ? metacritic_score : game.metacritic_score,
        playtime: playtime !== undefined ? playtime : game.playtime,
        released: released !== undefined ? released : game.released
      });
    
    await logModeratorActivity(
      req.userId, 
      'edit_game', 
      'game', 
      gameId, 
      `Updated game: ${name || game.name}`
    );
    
    const updatedGame = await db('games').where({ id: gameId }).first();
    
    res.json({ 
      message: 'Game updated successfully',
      game: updatedGame 
    });
  } catch (error) {
    console.error('Update game error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete game with logging (Moderators and Admins)
app.delete('/api/admin/games/:id', verifyToken, verifyModerator, async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    
    const game = await db('games').where({ id: gameId }).first();
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    await db.transaction(async (trx) => {
      await trx('user_game_lists').where('game_id', gameId).delete();
      await trx('game_genres').where('game_id', gameId).delete();
      await trx('game_platforms').where('game_id', gameId).delete();
      await trx('game_publishers').where('game_id', gameId).delete();
      await trx('game_developers').where('game_id', gameId).delete();
      await trx('games').where('id', gameId).delete();
    });
    
    await logModeratorActivity(
      req.userId, 
      'delete_game', 
      'game', 
      gameId, 
      `Deleted game: ${game.name}`
    );
    
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get stats (Moderators and Admins)
app.get('/api/admin/stats', verifyToken, verifyModerator, async (req, res) => {
  try {
    const [
      totalGames, totalUsers, totalModerators, bannedUsers, actionsToday
    ] = await Promise.all([
      db('games').count('id as count').first(),
      db('users').count('id as count').first(),
      db('users').where('is_moderator', true).count('id as count').first(),
      db('users').where('is_banned', true).count('id as count').first(),
      db('moderator_activity')
        .whereRaw('DATE(created_at) = CURDATE()')
        .count('id as count')
        .first()
    ]);
    
    res.json({
      totalGames: totalGames.count,
      totalUsers: totalUsers.count,
      totalModerators: totalModerators.count,
      bannedUsers: bannedUsers.count,
      actionsToday: actionsToday.count
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/genres', verifyToken, verifyModerator, async (req, res) => {
  try {
    const genres = await db('genres')
      .select('id', 'name', 'slug')
      .orderBy('name', 'asc');
    
    res.json({ genres });
  } catch (error) {
    console.error('Get genres error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/platforms', verifyToken, verifyModerator, async (req, res) => {
  try {
    const platforms = await db('platforms')
      .select('id', 'name', 'slug')
      .orderBy('name', 'asc');
    
    res.json({ platforms });
  } catch (error) {
    console.error('Get platforms error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Make user admin (Admin only)
app.put('/api/admin/users/:id/make-admin', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    await db('users')
      .where({ id: userId })
      .update({ is_admin: true, is_moderator: true });
    
    await logModeratorActivity(
      req.userId, 
      'promote_admin', 
      'user', 
      userId, 
      'Promoted to admin'
    );
    
    res.json({ message: 'User promoted to admin successfully' });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Remove admin status (Admin only)
app.put('/api/admin/users/:id/remove-admin', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot remove admin status from yourself' });
    }
    
    await db('users')
      .where({ id: userId })
      .update({ is_admin: false });
    
    await logModeratorActivity(
      req.userId, 
      'demote_admin', 
      'user', 
      userId, 
      'Removed admin status'
    );
    
    res.json({ message: 'Admin status removed successfully' });
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(400).json({ error: error.message });
  }
});

// =============================================
// ERROR HANDLING & SERVER START
// =============================================

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});