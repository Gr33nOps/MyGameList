const express = require('express');

module.exports = (db, verifyToken, verifyModerator, verifyAdmin, logModeratorActivity) => {
  const router = express.Router();

  // ============================================
  // USER MANAGEMENT ROUTES
  // ============================================

  // Get all users (Admin only)
  router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
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
      
      const users = await query
        .limit(parseInt(limit))
        .offset(parseInt(offset))
        .orderBy('created_at', 'desc');
      
      const countResult = await db('users').count('id as total').first();
      
      res.json({ 
        users,
        total: parseInt(countResult?.total || 0)
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Ban user (Admin only)
  router.put('/users/:id/ban', verifyToken, verifyAdmin, async (req, res) => {
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

  // Unban user (Admin only)
  router.put('/users/:id/unban', verifyToken, verifyAdmin, async (req, res) => {
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

  // Promote user to moderator (Admin only)
  router.put('/users/:id/promote', verifyToken, verifyAdmin, async (req, res) => {
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

  // Demote moderator (Admin only)
  router.put('/users/:id/demote', verifyToken, verifyAdmin, async (req, res) => {
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

  // Delete user (Admin only)
  router.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
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

  // ============================================
  // STATS AND ACTIVITY
  // ============================================

  // Get stats (Admin only)
  router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const [
        totalUsers, totalModerators, bannedUsers
      ] = await Promise.all([
        db('users').count('id as count').first(),
        db('users').where('is_moderator', true).count('id as count').first(),
        db('users').where('is_banned', true).count('id as count').first()
      ]);
      
      res.json({
        totalUsers: parseInt(totalUsers?.count || 0),
        totalModerators: parseInt(totalModerators?.count || 0),
        bannedUsers: parseInt(bannedUsers?.count || 0)
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get activity log (Admin only)
  router.get('/activity', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const { limit = 50, offset = 0, action_type } = req.query;
      
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
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};