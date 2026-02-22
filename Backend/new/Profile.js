const express = require('express');

module.exports = (db, bcrypt, verifyToken, checkBanned) => {
  const router = express.Router();

  // Get current user profile
  router.get('/profile', verifyToken, checkBanned, async (req, res) => {
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

  // Update user profile
  router.put('/profile', verifyToken, checkBanned, async (req, res) => {
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

  // Update password
  router.put('/password', verifyToken, checkBanned, async (req, res) => {
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

  return router;
};