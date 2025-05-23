// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, 'your_secret_key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });

    req.user = user; // store decoded user info in req.user
    next();
  });
}

module.exports = authenticateToken;
