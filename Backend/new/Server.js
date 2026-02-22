const express = require('express');
const cors = require('cors');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

// ─── .env is in the project root (one folder up from Backend\) ───
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Fail fast if any required var is missing ────────────────────
const REQUIRED_ENV = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'JWT_SECRET',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('\n❌  Missing environment variables:\n');
  missing.forEach(k => console.error(`     - ${k}`));
  console.error('\n   .env expected at:', path.resolve(__dirname, '..', '.env'), '\n');
  process.exit(1);
}

const app = express();

// =============================================
// MIDDLEWARE - IMPORTANT: ORDER MATTERS!
// =============================================
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
// MIDDLEWARE FUNCTIONS
// =============================================

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

// FIXED: verifyModerator now allows both moderators AND admins
const verifyModerator = async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.userId }).first();
    
    // Allow if user is moderator OR admin
    if (!user || (!user.is_moderator && !user.is_admin)) {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    
    req.userRole = {
      isModerator: user.is_moderator || user.is_admin,
      isAdmin: user.is_admin || false
    };
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.userId }).first();
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }
    
    req.userRole = {
      isModerator: true,
      isAdmin: true
    };
    
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

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
// IMPORT ROUTES WITH ERROR HANDLING
// =============================================

console.log('Loading routes...');

try {
  console.log('  ✓ Loading auth routes...');
  const authRoutes = require('./auth');
  app.use('/api/auth', authRoutes(db, jwt, bcrypt, JWT_SECRET, verifyToken, checkBanned));
  console.log('  ✓ Auth routes loaded');
} catch (error) {
  console.error('  ✗ Error loading auth routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading home routes...');
  const homeRoutes = require('./home');
  app.use('/api', homeRoutes(db));
  console.log('  ✓ Home routes loaded');
} catch (error) {
  console.error('  ✗ Error loading home routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading profile routes...');
  const profileRoutes = require('./profile');
  app.use('/api/user', profileRoutes(db, bcrypt, verifyToken, checkBanned));
  console.log('  ✓ Profile routes loaded');
} catch (error) {
  console.error('  ✗ Error loading profile routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading myGameList routes...');
  const myGameListRoutes = require('./myGameList');
  app.use('/api/user', myGameListRoutes(db, verifyToken, checkBanned));
  console.log('  ✓ MyGameList routes loaded');
} catch (error) {
  console.error('  ✗ Error loading myGameList routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading friends routes...');
  const friendsRoutes = require('./friends');
  app.use('/api', friendsRoutes(db, verifyToken, checkBanned));
  console.log('  ✓ Friends routes loaded');
} catch (error) {
  console.error('  ✗ Error loading friends routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading userProfile routes...');
  const userProfileRoutes = require('./userProfile');
  app.use('/api/users', userProfileRoutes(db, verifyToken, checkBanned));
  console.log('  ✓ UserProfile routes loaded');
} catch (error) {
  console.error('  ✗ Error loading userProfile routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading admin routes...');
  const adminRoutes = require('./admin');
  app.use('/api/admin', adminRoutes(db, verifyToken, verifyModerator, verifyAdmin, logModeratorActivity));
  console.log('  ✓ Admin routes loaded');
} catch (error) {
  console.error('  ✗ Error loading admin routes:', error.message);
  process.exit(1);
}

// ADD MODERATOR ROUTES
try {
  console.log('  ✓ Loading moderator routes...');
  const moderatorRoutes = require('./moderator');
  app.use('/api/moderator', moderatorRoutes(db, verifyToken, verifyModerator, logModeratorActivity));
  console.log('  ✓ Moderator routes loaded');
} catch (error) {
  console.error('  ✗ Error loading moderator routes:', error.message);
  process.exit(1);
}

try {
  console.log('  ✓ Loading IGDB proxy routes...');
  const igdbRoutes = require('./igdb');
  app.use('/api/igdb', igdbRoutes());
  console.log('  ✓ IGDB proxy routes loaded');
} catch (error) {
  console.error('  ✗ Error loading IGDB proxy routes:', error.message);
  process.exit(1);
}

console.log('All routes loaded successfully!\n');

// =============================================
// STATIC FILES - SERVE FRONTEND
// =============================================

// The frontend folder is one level up from Backend
const frontendPath = path.join(__dirname, '..', 'Frontend');

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(frontendPath));

// Handle HTML file requests explicitly
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'home.html'));
});

app.get('/auth.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'auth.html'));
});

app.get('/home.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'home.html'));
});

app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'profile.html'));
});

app.get('/myGameList.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'myGameList.html'));
});

app.get('/friends.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'friends.html'));
});

app.get('/userProfile.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'userProfile.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin-dashboard.html'));
});

app.get('/moderator-dashboard.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'moderator-dashboard.html'));
});

// =============================================
// ERROR HANDLING
// =============================================

app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
═══════════════════════════════════════════════════════════════════════
🎮 My Game List Server Running                                    
═══════════════════════════════════════════════════════════════════════
Port: ${PORT}                    
Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
Environment: ${process.env.NODE_ENV || 'development'}
Frontend Path: ${frontendPath}
═══════════════════════════════════════════════════════════════════════
  `);
});