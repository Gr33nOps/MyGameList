const express = require('express');
const cors = require('cors');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('\nMissing environment variables:\n');
  missing.forEach(k => console.error(`  - ${k}`));
  console.error('\n.env expected at:', path.resolve(__dirname, '..', '.env'), '\n');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  },
  pool: { min: 2, max: 10 }
});

db.raw('SELECT 1')
  .then(() => console.log('Supabase PostgreSQL connected'))
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;

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

const checkBanned = async (req, res, next) => {
  try {
    const dbUser = await db('users').where({ id: req.userId }).first();
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    if (dbUser.is_banned) {
      return res.status(403).json({
        error: 'Your account has been banned',
        reason: dbUser.ban_reason || null
      });
    }
    next();
  } catch (error) {
    console.error('checkBanned error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyModerator = async (req, res, next) => {
  try {
    const dbUser = await db('users').where({ id: req.userId }).first();
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    if (dbUser.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    if (!dbUser.is_moderator && !dbUser.is_admin) {
      return res.status(403).json({ error: 'Moderator access required' });
    }

    req.userRole = {
      isModerator: dbUser.is_moderator || dbUser.is_admin,
      isAdmin:     dbUser.is_admin || false
    };

    next();
  } catch (error) {
    console.error('verifyModerator error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const dbUser = await db('users').where({ id: req.userId }).first();
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    if (dbUser.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    if (!dbUser.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.userRole = { isModerator: true, isAdmin: true };
    next();
  } catch (error) {
    console.error('verifyAdmin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

async function logModeratorActivity(moderatorId, actionType, targetType, targetId, details = null) {
  try {
    await db('moderator_activity').insert({
      moderator_id: moderatorId,
      action_type:  actionType,
      target_type:  targetType,
      target_id:    targetId,
      details:      details
    });
  } catch (error) {
    console.error('Activity logging error:', error);
  }
}

console.log('Loading routes...');

try {
  const authRoutes = require('./auth');
  app.use('/api/auth', authRoutes(db, jwt, bcrypt, JWT_SECRET, verifyToken, checkBanned));
  console.log('  Auth routes loaded');
} catch (error) {
  console.error('  Error loading auth routes:', error.message);
  process.exit(1);
}

try {
  const homeRoutes = require('./home');
  app.use('/api', homeRoutes(db));
  console.log('  Home routes loaded');
} catch (error) {
  console.error('  Error loading home routes:', error.message);
  process.exit(1);
}

try {
  const profileRoutes = require('./profile');
  app.use('/api/user', profileRoutes(db, bcrypt, verifyToken, checkBanned));
  console.log('  Profile routes loaded');
} catch (error) {
  console.error('  Error loading profile routes:', error.message);
  process.exit(1);
}

try {
  const myGameListRoutes = require('./myGameList');
  app.use('/api/user', myGameListRoutes(db, verifyToken, checkBanned));
  console.log('  MyGameList routes loaded');
} catch (error) {
  console.error('  Error loading myGameList routes:', error.message);
  process.exit(1);
}

try {
  const friendsRoutes = require('./friends');
  app.use('/api', friendsRoutes(db, verifyToken, checkBanned));
  console.log('  Friends routes loaded');
} catch (error) {
  console.error('  Error loading friends routes:', error.message);
  process.exit(1);
}

try {
  const userProfileRoutes = require('./userProfile');
  app.use('/api/users', userProfileRoutes(db, verifyToken, checkBanned));
  console.log('  UserProfile routes loaded');
} catch (error) {
  console.error('  Error loading userProfile routes:', error.message);
  process.exit(1);
}

try {
  const adminRoutes = require('./admin');
  app.use('/api/admin', adminRoutes(db, verifyToken, verifyModerator, verifyAdmin, logModeratorActivity));
  console.log('  Admin routes loaded');
} catch (error) {
  console.error('  Error loading admin routes:', error.message);
  process.exit(1);
}

try {
  const moderatorRoutes = require('./moderator');
  app.use('/api/moderator', moderatorRoutes(db, verifyToken, verifyModerator, logModeratorActivity));
  console.log('  Moderator routes loaded');
} catch (error) {
  console.error('  Error loading moderator routes:', error.message);
  process.exit(1);
}

try {
  const igdbRoutes = require('./igdb');
  app.use('/api/igdb', igdbRoutes());
  console.log('  IGDB proxy routes loaded');
} catch (error) {
  console.error('  Error loading IGDB proxy routes:', error.message);
  process.exit(1);
}

console.log('All routes loaded\n');

const frontendPath = path.join(__dirname, '..', 'Frontend');
app.use(express.static(frontendPath));

app.get('/',                         (req, res) => res.sendFile(path.join(frontendPath, 'home.html')));
app.get('/auth.html',                (req, res) => res.sendFile(path.join(frontendPath, 'auth.html')));
app.get('/home.html',                (req, res) => res.sendFile(path.join(frontendPath, 'home.html')));
app.get('/profile.html',             (req, res) => res.sendFile(path.join(frontendPath, 'profile.html')));
app.get('/myGameList.html',          (req, res) => res.sendFile(path.join(frontendPath, 'myGameList.html')));
app.get('/friends.html',             (req, res) => res.sendFile(path.join(frontendPath, 'friends.html')));
app.get('/userProfile.html',         (req, res) => res.sendFile(path.join(frontendPath, 'userProfile.html')));
app.get('/admin-dashboard.html',     (req, res) => res.sendFile(path.join(frontendPath, 'admin-dashboard.html')));
app.get('/moderator-dashboard.html', (req, res) => res.sendFile(path.join(frontendPath, 'moderator-dashboard.html')));

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});