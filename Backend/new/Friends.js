const express = require('express');

module.exports = (db, verifyToken, checkBanned) => {
  const router = express.Router();

  // Search users
  router.get('/users/search', verifyToken, checkBanned, async (req, res) => {
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

  // Get following list
  router.get('/following', verifyToken, checkBanned, async (req, res) => {
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

  // Get followers list
  router.get('/followers', verifyToken, checkBanned, async (req, res) => {
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

  // Follow a user
  router.post('/follow/:userId', verifyToken, checkBanned, async (req, res) => {
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

  // Unfollow a user
  router.delete('/follow/:userId', verifyToken, checkBanned, async (req, res) => {
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

  // Check follow status
  router.get('/follow/status/:userId', verifyToken, checkBanned, async (req, res) => {
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

  return router;
};