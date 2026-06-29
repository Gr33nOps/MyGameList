const express = require('express');
const { createClient } = require('@supabase/supabase-js');

module.exports = (db, verifyToken, checkBanned) => {
  const router = express.Router();

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function getAllSupabaseUsers() {
    let allUsers = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      allUsers = allUsers.concat(data.users || []);
      if ((data.users || []).length < perPage) break;
      page++;
    }
    return allUsers;
  }

  function mapUser(user, extra = {}) {
    const meta = user.user_metadata || {};
    return {
      id:           user.id,
      username:     meta.username     || user.email?.split('@')[0] || 'unknown',
      display_name: meta.display_name || meta.username             || '',
      avatar_url:   meta.avatar_url   || null,
      ...extra
    };
  }

  async function getActiveUser(userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const meta = data.user.user_metadata || {};
    if (meta.is_banned) return null;
    return data.user;
  }

  router.get('/users/search', verifyToken, checkBanned, async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || query.trim().length < 2) {
        return res.json({ users: [] });
      }

      const searchTerm = query.toLowerCase().trim();
      const allUsers = await getAllSupabaseUsers();

      const matched = allUsers
        .filter(user => {
          const meta = user.user_metadata || {};
          if (meta.is_banned)        return false;
          if (user.id === req.userId) return false;
          const username    = (meta.username     || '').toLowerCase();
          const displayName = (meta.display_name || '').toLowerCase();
          return username.includes(searchTerm) || displayName.includes(searchTerm);
        })
        .slice(0, 10)
        .map(user => mapUser(user));

      res.json({ users: matched });
    } catch (error) {
      console.error('Search users error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/following', verifyToken, checkBanned, async (req, res) => {
    try {
      const rows = await db('user_follows')
        .where('follower_id', req.userId)
        .orderBy('created_at', 'desc')
        .select('following_id', 'created_at');

      const following = (
        await Promise.all(
          rows.map(async row => {
            const user = await getActiveUser(row.following_id);
            if (!user) return null;
            return mapUser(user, { followed_since: row.created_at });
          })
        )
      ).filter(Boolean);

      res.json({ following });
    } catch (error) {
      console.error('Get following error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/followers', verifyToken, checkBanned, async (req, res) => {
    try {
      const rows = await db('user_follows')
        .where('following_id', req.userId)
        .orderBy('created_at', 'desc')
        .select('follower_id', 'created_at');

      const followers = (
        await Promise.all(
          rows.map(async row => {
            const user = await getActiveUser(row.follower_id);
            if (!user) return null;
            return mapUser(user, { followed_since: row.created_at });
          })
        )
      ).filter(Boolean);

      res.json({ followers });
    } catch (error) {
      console.error('Get followers error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/follow/:userId', verifyToken, checkBanned, async (req, res) => {
    try {
      const followingId = req.params.userId;

      if (followingId === req.userId) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
      }

      const targetUser = await getActiveUser(followingId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existing = await db('user_follows')
        .where({ follower_id: req.userId, following_id: followingId })
        .first();

      if (existing) {
        return res.status(400).json({ error: 'Already following this user' });
      }

      await db('user_follows').insert({
        follower_id:  req.userId,
        following_id: followingId
      });

      res.json({ message: 'User followed successfully' });
    } catch (error) {
      console.error('Follow user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/follow/:userId', verifyToken, checkBanned, async (req, res) => {
    try {
      const followingId = req.params.userId;

      const deleted = await db('user_follows')
        .where({ follower_id: req.userId, following_id: followingId })
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

  router.get('/follow/status/:userId', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = req.params.userId;

      const [following, followsYou] = await Promise.all([
        db('user_follows')
          .where({ follower_id: req.userId, following_id: userId })
          .first(),
        db('user_follows')
          .where({ follower_id: userId, following_id: req.userId })
          .first()
      ]);

      res.json({
        isFollowing: !!following,
        followsYou:  !!followsYou
      });
    } catch (error) {
      console.error('Check follow status error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};