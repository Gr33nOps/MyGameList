const express = require('express');

module.exports = (db, verifyToken, checkBanned) => {
  const router = express.Router();

  // ── Get user profile by ID ─────────────────────────────────────────────
  router.get('/:userId', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      const user = await db('users')
        .where({ id: userId })
        .where('is_banned', false)
        .select('id', 'username', 'display_name', 'avatar_url', 'created_at')
        .first();

      if (!user) return res.status(404).json({ error: 'User not found' });

      const [games, followers, following] = await Promise.all([
        db('user_game_lists').where('user_id', userId).count('id as count').first(),
        db('user_follows').where('following_id', userId).count('* as count').first(),
        db('user_follows').where('follower_id', userId).count('* as count').first()
      ]);

      res.json({
        user: {
          ...user,
          totalGames:     games.count     || 0,
          followersCount: followers.count || 0,
          followingCount: following.count || 0
        }
      });
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ── Get user's games ───────────────────────────────────────────────────
  router.get('/:userId/games', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      const user = await db('users').where({ id: userId, is_banned: false }).first();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const games = await db('user_game_lists')
        .join('games', 'user_game_lists.game_id', 'games.id')
        .where('user_game_lists.user_id', userId)
        .select(
          'games.id',
          'games.name',
          'games.background_image',
          'games.rating',
          'games.description',
          'games.released',
          'games.metacritic_score',
          'games.playtime',
          'user_game_lists.status',
          'user_game_lists.score',
          'user_game_lists.progress_hours',
          'user_game_lists.created_at as date_added'
        )
        .orderBy('user_game_lists.updated_at', 'desc');

      const gameIds = games.map(game => game.id);

      if (gameIds.length > 0) {
        const [genres, platforms, publishers, developers] = await Promise.all([
          db('game_genres')
            .join('genres', 'game_genres.genre_id', 'genres.id')
            .whereIn('game_genres.game_id', gameIds)
            .select('game_genres.game_id', 'genres.id', 'genres.name'),
          db('game_platforms')
            .join('platforms', 'game_platforms.platform_id', 'platforms.id')
            .whereIn('game_platforms.game_id', gameIds)
            .select('game_platforms.game_id', 'platforms.id', 'platforms.name'),
          db('game_publishers')
            .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
            .whereIn('game_publishers.game_id', gameIds)
            .select('game_publishers.game_id', 'publishers.id', 'publishers.name'),
          db('game_developers')
            .join('developers', 'game_developers.developer_id', 'developers.id')
            .whereIn('game_developers.game_id', gameIds)
            .select('game_developers.game_id', 'developers.id', 'developers.name')
        ]);

        games.forEach(game => {
          game.genres     = genres.filter(g => g.game_id === game.id).map(g => ({ id: g.id, name: g.name }));
          game.platforms  = platforms.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
          game.publishers = publishers.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
          game.developers = developers.filter(d => d.game_id === game.id).map(d => ({ id: d.id, name: d.name }));
        });
      }

      res.json({ games });
    } catch (error) {
      console.error('Get user games error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ── Get user's followers ───────────────────────────────────────────────
  router.get('/:userId/followers', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      const followers = await db('user_follows')
        .join('users', 'user_follows.follower_id', 'users.id')
        .where('user_follows.following_id', userId)
        .where('users.is_banned', false)
        .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url')
        .orderBy('user_follows.created_at', 'desc');

      res.json({ followers });
    } catch (error) {
      console.error('Get user followers error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ── Get user's following ───────────────────────────────────────────────
  router.get('/:userId/following', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      const following = await db('user_follows')
        .join('users', 'user_follows.following_id', 'users.id')
        .where('user_follows.follower_id', userId)
        .where('users.is_banned', false)
        .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url')
        .orderBy('user_follows.created_at', 'desc');

      res.json({ following });
    } catch (error) {
      console.error('Get user following error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ── Get user's PUBLIC custom lists ─────────────────────────────────────
  router.get('/:userId/lists', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      const user = await db('users').where({ id: userId, is_banned: false }).first();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const lists = await db('custom_lists')
        .where({ user_id: userId, is_public: 1 })
        .orderBy('created_at', 'desc');

      if (lists.length === 0) return res.json({ lists: [] });

      const listIds = lists.map(l => l.id);

      const counts = await db('custom_list_games')
        .whereIn('list_id', listIds)
        .groupBy('list_id')
        .select('list_id', db.raw('COUNT(*) as game_count'));

      const countMap = {};
      counts.forEach(c => { countMap[c.list_id] = c.game_count; });

      res.json({
        lists: lists.map(l => ({
          ...l,
          game_count: countMap[l.id] || 0
        }))
      });
    } catch (error) {
      console.error('Get user public lists error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Get a single PUBLIC list with its games ────────────────────────────
  router.get('/:userId/lists/:listId', verifyToken, checkBanned, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const listId = parseInt(req.params.listId);

      const list = await db('custom_lists')
        .where({ id: listId, user_id: userId, is_public: 1 })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found or is private' });

      const games = await db('custom_list_games')
        .join('games', 'custom_list_games.game_id', 'games.id')
        .where('custom_list_games.list_id', list.id)
        .orderBy('custom_list_games.position', 'asc')
        .select(
          'custom_list_games.id as list_entry_id',
          'custom_list_games.game_id',
          'custom_list_games.note',
          'custom_list_games.position',
          'custom_list_games.added_at',
          'custom_list_games.status',
          'custom_list_games.score as user_score',
          'games.name',
          'games.background_image',
          'games.rating',
          'games.released',
          'games.metacritic_score',
          'games.slug as game_slug'
        );

      const gameIds = games.map(g => g.game_id);
      let genres = [];
      if (gameIds.length > 0) {
        genres = await db('game_genres')
          .join('genres', 'game_genres.genre_id', 'genres.id')
          .whereIn('game_genres.game_id', gameIds)
          .select('game_genres.game_id', 'genres.name');
      }

      const genresByGame = {};
      genres.forEach(g => {
        if (!genresByGame[g.game_id]) genresByGame[g.game_id] = [];
        genresByGame[g.game_id].push(g.name);
      });

      res.json({
        list: {
          ...list,
          games: games.map(g => ({ ...g, genres: genresByGame[g.game_id] || [] }))
        }
      });
    } catch (error) {
      console.error('Get user public list detail error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};