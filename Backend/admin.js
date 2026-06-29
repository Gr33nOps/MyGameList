const express = require('express');
const { createClient } = require('@supabase/supabase-js');

module.exports = (db, verifyToken, verifyModerator, verifyAdmin, logModeratorActivity) => {
  const router = express.Router();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  async function getAllSupabaseUsers() {
    let allUsers = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      allUsers = allUsers.concat(data.users || []);
      if ((data.users || []).length < perPage) break;
      page++;
    }

    return allUsers;
  }

  function mapUser(user) {
    const meta = user.user_metadata || {};
    return {
      id:           user.id,
      email:        user.email,
      username:     meta.username     || user.email?.split('@')[0] || 'unknown',
      display_name: meta.display_name || meta.username || '',
      avatar_url:   meta.avatar_url   || null,
      is_moderator: meta.is_moderator || false,
      is_admin:     meta.is_admin     || false,
      is_banned:    meta.is_banned    || false,
      ban_reason:   meta.ban_reason   || null,
      banned_at:    meta.banned_at    || null,
      created_at:   user.created_at
    };
  }

  router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { search, limit = 100, offset = 0 } = req.query;

      let users = await getAllSupabaseUsers();

      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(user => {
          const meta = user.user_metadata || {};
          return (
            (user.email           || '').toLowerCase().includes(searchLower) ||
            (meta.username        || '').toLowerCase().includes(searchLower) ||
            (meta.display_name    || '').toLowerCase().includes(searchLower)
          );
        });
      }

      const total = users.length;

      users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const paginated = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      res.json({ users: paginated.map(mapUser), total });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/users/:id/ban', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { reason } = req.body;

      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot ban yourself' });
      }

      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(userId);
      if (fetchError || !userData?.user) return res.status(404).json({ error: 'User not found' });

      const meta = userData.user.user_metadata || {};

      if (meta.is_banned) return res.status(400).json({ error: 'User is already banned' });
      if (meta.is_admin)  return res.status(403).json({ error: 'Cannot ban an admin' });

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...meta,
          is_banned:  true,
          banned_at:  new Date().toISOString(),
          banned_by:  req.userId,
          ban_reason: reason || null
        }
      });

      if (updateError) throw new Error(updateError.message);

      try {
        await db('ban_history').insert({
          user_id:    userId,
          banned_by:  req.userId,
          ban_reason: reason || null
        });
      } catch (_) {}

      await logModeratorActivity(req.userId, 'ban_user', 'user', userId, reason || 'No reason provided');

      res.json({ message: 'User banned successfully' });
    } catch (error) {
      console.error('Ban user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/users/:id/unban', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const userId = req.params.id;

      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(userId);
      if (fetchError || !userData?.user) return res.status(404).json({ error: 'User not found' });

      const meta = userData.user.user_metadata || {};
      if (!meta.is_banned) return res.status(400).json({ error: 'User is not banned' });

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...meta,
          is_banned:  false,
          banned_at:  null,
          banned_by:  null,
          ban_reason: null
        }
      });

      if (updateError) throw new Error(updateError.message);

      try {
        await db('ban_history')
          .where({ user_id: userId })
          .whereNull('unbanned_at')
          .update({ unbanned_at: db.fn.now(), unbanned_by: req.userId });
      } catch (_) {}

      await logModeratorActivity(
        req.userId, 'unban_user', 'user', userId,
        `Unbanned ${meta.username || userId}`
      );

      res.json({ message: 'User unbanned successfully' });
    } catch (error) {
      console.error('Unban user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/users/:id/promote', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const userId = req.params.id;

      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(userId);
      if (fetchError || !userData?.user) return res.status(404).json({ error: 'User not found' });

      const meta = userData.user.user_metadata || {};
      if (meta.is_moderator) return res.status(400).json({ error: 'User is already a moderator' });

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...meta, is_moderator: true }
      });

      if (updateError) throw new Error(updateError.message);

      await logModeratorActivity(
        req.userId, 'promote_moderator', 'user', userId,
        `Promoted ${meta.username || userId} to moderator`
      );

      res.json({ message: 'User promoted to moderator successfully' });
    } catch (error) {
      console.error('Promote moderator error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/users/:id/demote', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const userId = req.params.id;

      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot demote yourself' });
      }

      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(userId);
      if (fetchError || !userData?.user) return res.status(404).json({ error: 'User not found' });

      const meta = userData.user.user_metadata || {};
      if (meta.is_admin)      return res.status(403).json({ error: 'Cannot demote an admin' });
      if (!meta.is_moderator) return res.status(400).json({ error: 'User is not a moderator' });

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...meta, is_moderator: false }
      });

      if (updateError) throw new Error(updateError.message);

      await logModeratorActivity(
        req.userId, 'demote_moderator', 'user', userId,
        `Demoted ${meta.username || userId} from moderator`
      );

      res.json({ message: 'Moderator demoted successfully' });
    } catch (error) {
      console.error('Demote moderator error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const userId = req.params.id;

      if (userId === req.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const { data: userData, error: fetchError } = await supabase.auth.admin.getUserById(userId);
      if (fetchError || !userData?.user) return res.status(404).json({ error: 'User not found' });

      const meta = userData.user.user_metadata || {};
      if (meta.is_admin) return res.status(403).json({ error: 'Cannot delete an admin' });

      try {
        await db.transaction(async (trx) => {
          await trx('user_game_lists').where('user_id', userId).delete();
          await trx('user_follows')
            .where('follower_id', userId)
            .orWhere('following_id', userId)
            .delete();
          await trx('ban_history').where('user_id', userId).delete();
          await trx('moderator_activity').where('moderator_id', userId).delete();
        });
      } catch (_) {}

      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) throw new Error(deleteError.message);

      await logModeratorActivity(
        req.userId, 'delete_user', 'user', userId,
        `Permanently deleted ${meta.username || userId}`
      );

      res.json({ message: 'User permanently deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const users = await getAllSupabaseUsers();

      const totalUsers      = users.length;
      const totalModerators = users.filter(u => u.user_metadata?.is_moderator && !u.user_metadata?.is_admin).length;
      const bannedUsers     = users.filter(u => u.user_metadata?.is_banned).length;

      res.json({ totalUsers, totalModerators, bannedUsers });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/activity', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { limit = 50, offset = 0, action_type } = req.query;

      let query = db('moderator_activity')
        .select('moderator_activity.*')
        .orderBy('moderator_activity.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (action_type) query = query.where('moderator_activity.action_type', action_type);

      const activities = await query;

      const uuidSet = new Set();
      activities.forEach(activity => {
        if (activity.moderator_id) uuidSet.add(activity.moderator_id);
        if (activity.target_type === 'user' && activity.target_id) uuidSet.add(String(activity.target_id));
      });

      const userMap = {};
      await Promise.all(
        [...uuidSet].map(async (uid) => {
          try {
            const { data } = await supabase.auth.admin.getUserById(uid);
            if (data?.user) {
              userMap[uid] = data.user.user_metadata?.username || data.user.email || uid;
            }
          } catch (_) {}
        })
      );

      const enriched = activities.map(activity => ({
        ...activity,
        moderator_username: userMap[activity.moderator_id] || null,
        target_username:    activity.target_type === 'user' ? (userMap[String(activity.target_id)] || null) : null,
        target_name:        null
      }));

      const gameTargetIds = enriched
        .filter(activity => activity.target_type === 'game' && activity.target_id)
        .map(activity => activity.target_id);

      if (gameTargetIds.length > 0) {
        try {
          const games = await db('games').whereIn('id', gameTargetIds).select('id', 'name');
          const gameMap = Object.fromEntries(games.map(game => [game.id, game.name]));
          enriched.forEach(activity => {
            if (activity.target_type === 'game' && activity.target_id) {
              activity.target_name = gameMap[activity.target_id] || null;
            }
          });
        } catch (_) {}
      }

      res.json({ activities: enriched });
    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};