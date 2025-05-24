const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../db'); // Assumes db.js exports the MySQL pool

// Register
router.post(
  '/register',
  [
    body('username').isString().trim().notEmpty().withMessage('Username is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    try {
      // Check if JWT_SECRET is defined
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in environment variables');
      }

      // Check for existing user
      const [existing] = await pool.query('SELECT * FROM USER WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Insert new user
      const [result] = await pool.query(
        'INSERT INTO USER (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, password_hash]
      );

      // Generate JWT
      const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(201).json({ token });
    } catch (err) {
      console.error('Error registering user:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Fixed: Changed 'password' to 'password_hash' to match database schema
      const [users] = await pool.query('SELECT user_id, username, password_hash FROM USER WHERE email = ?', [email]);
      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];
      // Fixed: Changed 'user.password' to 'user.password_hash' to match the selected column
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, name: user.username });
    } catch (err) {
      console.error('Error logging in:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;