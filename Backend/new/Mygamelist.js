const express = require('express');

module.exports = (db, verifyToken, checkBanned) => {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  function generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function getOrCreateEntity(table, name) {
    try {
      let entity = await db(table).where({ name }).first();
      if (entity) return entity.id;

      const slug = generateSlug(name);
      try {
        const [id] = await db(table).insert({ name, slug: slug || name });
        return id;
      } catch {
        const uniqueSlug = `${slug}-${Date.now()}`;
        const [id] = await db(table).insert({ name, slug: uniqueSlug });
        return id;
      }
    } catch (error) {
      const entity = await db(table).where({ name }).first();
      if (entity) return entity.id;
      throw error;
    }
  }

  async function ensureGameExists(gameData) {
    try {
      if (gameData.igdb_id) {
        const existing = await db('games').where({ igdb_id: gameData.igdb_id }).first();
        if (existing) {
          console.log(`Game already exists with ID: ${existing.id}`);
          return existing.id;
        }
      }

      const existingByName = await db('games').where({ name: gameData.name }).first();
      if (existingByName) {
        console.log(`Game found by name with ID: ${existingByName.id}`);
        if (!existingByName.igdb_id && gameData.igdb_id) {
          await db('games').where({ id: existingByName.id }).update({ igdb_id: gameData.igdb_id });
        }
        return existingByName.id;
      }

      console.log(`Creating new game: ${gameData.name}`);
      const slug = generateSlug(gameData.name);
      let gameId;

      try {
        [gameId] = await db('games').insert({
          igdb_id: gameData.igdb_id || null,
          name: gameData.name,
          slug: slug || gameData.name,
          description: gameData.description || null,
          background_image: gameData.background_image || null,
          rating: gameData.rating || 0,
          metacritic_score: gameData.metacritic_score || null,
          released: gameData.released || null,
          playtime: gameData.playtime || 0
        });
      } catch {
        const uniqueSlug = `${slug}-${Date.now()}`;
        [gameId] = await db('games').insert({
          igdb_id: gameData.igdb_id || null,
          name: gameData.name,
          slug: uniqueSlug,
          description: gameData.description || null,
          background_image: gameData.background_image || null,
          rating: gameData.rating || 0,
          metacritic_score: gameData.metacritic_score || null,
          released: gameData.released || null,
          playtime: gameData.playtime || 0
        });
      }

      console.log(`Game created with ID: ${gameId}`);

      if (gameData.genres?.length) {
        for (const genre of gameData.genres) {
          try {
            const genreId = await getOrCreateEntity('genres', genre.name);
            await db.raw('INSERT IGNORE INTO game_genres (game_id, genre_id) VALUES (?, ?)', [gameId, genreId]);
          } catch (e) { console.error(`Error adding genre ${genre.name}:`, e.message); }
        }
      }
      if (gameData.platforms?.length) {
        for (const platform of gameData.platforms) {
          try {
            const platformId = await getOrCreateEntity('platforms', platform.name);
            await db.raw('INSERT IGNORE INTO game_platforms (game_id, platform_id) VALUES (?, ?)', [gameId, platformId]);
          } catch (e) { console.error(`Error adding platform ${platform.name}:`, e.message); }
        }
      }
      if (gameData.publishers?.length) {
        for (const publisher of gameData.publishers) {
          try {
            const publisherId = await getOrCreateEntity('publishers', publisher.name);
            await db.raw('INSERT IGNORE INTO game_publishers (game_id, publisher_id) VALUES (?, ?)', [gameId, publisherId]);
          } catch (e) { console.error(`Error adding publisher ${publisher.name}:`, e.message); }
        }
      }
      if (gameData.developers?.length) {
        for (const developer of gameData.developers) {
          try {
            const developerId = await getOrCreateEntity('developers', developer.name);
            await db.raw('INSERT IGNORE INTO game_developers (game_id, developer_id) VALUES (?, ?)', [gameId, developerId]);
          } catch (e) { console.error(`Error adding developer ${developer.name}:`, e.message); }
        }
      }

      return gameId;
    } catch (error) {
      console.error('Error ensuring game exists:', error);
      throw error;
    }
  }

  // Unique slug per user for custom lists
  async function getUniqueListSlug(userId, name, excludeId = null) {
    let slug = generateSlug(name) || 'list';
    let candidate = slug;
    let counter = 1;
    while (true) {
      let query = db('custom_lists').where({ user_id: userId, slug: candidate });
      if (excludeId) query = query.whereNot({ id: excludeId });
      const existing = await query.first();
      if (!existing) return candidate;
      candidate = `${slug}-${counter++}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLLECTION ROUTES
  // ═══════════════════════════════════════════════════════════════════════

  // POST /user/games — Add game to collection
  router.post('/games', verifyToken, checkBanned, async (req, res) => {
    try {
      const { game_id, game_data, status, score } = req.body;
      let dbGameId;

      if (game_data) {
        dbGameId = await ensureGameExists(game_data);
      } else if (game_id && game_id.toString().startsWith('igdb_')) {
        return res.status(400).json({ error: 'Game data required for IGDB games' });
      } else {
        dbGameId = game_id;
      }

      const existing = await db('user_game_lists')
        .where({ user_id: req.userId, game_id: dbGameId })
        .first();
      if (existing) return res.status(400).json({ error: 'Game already in your list' });

      await db('user_game_lists').insert({
        user_id: req.userId,
        game_id: dbGameId,
        status: status || 'plan_to_play',
        score: score || null
      });

      res.status(201).json({ message: 'Game added successfully' });
    } catch (error) {
      console.error('Add game error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // GET /user/games — Get user's game collection
  router.get('/games', verifyToken, checkBanned, async (req, res) => {
    try {
      const { status, sort = 'added_date', order = 'desc' } = req.query;
      const sortOrder = order.toLowerCase() === 'asc' ? 'asc' : 'desc';

      let query = db('user_game_lists')
        .join('games', 'user_game_lists.game_id', 'games.id')
        .where('user_game_lists.user_id', req.userId)
        .select(
          'user_game_lists.*',
          'games.name',
          'games.background_image',
          'games.rating',
          'games.description',
          'games.released',
          'games.metacritic_score',
          'games.playtime'
        );

      if (status) query = query.where('user_game_lists.status', status);

      switch (sort) {
        case 'name':       query = query.orderBy('games.name', sortOrder); break;
        case 'rating':     query = query.orderBy('games.rating', sortOrder); break;
        case 'score':      query = query.orderBy('user_game_lists.score', sortOrder); break;
        case 'added_date':
        default:           query = query.orderBy('user_game_lists.created_at', sortOrder); break;
      }

      const userGames = await query;
      const gameIds   = userGames.map(ug => ug.game_id);

      if (gameIds.length === 0) return res.json({ games: [] });

      const [genres, platforms, publishers, developers] = await Promise.all([
        db('game_genres').join('genres','game_genres.genre_id','genres.id').whereIn('game_genres.game_id', gameIds).select('game_genres.game_id','genres.id','genres.name'),
        db('game_platforms').join('platforms','game_platforms.platform_id','platforms.id').whereIn('game_platforms.game_id', gameIds).select('game_platforms.game_id','platforms.id','platforms.name'),
        db('game_publishers').join('publishers','game_publishers.publisher_id','publishers.id').whereIn('game_publishers.game_id', gameIds).select('game_publishers.game_id','publishers.id','publishers.name'),
        db('game_developers').join('developers','game_developers.developer_id','developers.id').whereIn('game_developers.game_id', gameIds).select('game_developers.game_id','developers.id','developers.name')
      ]);

      userGames.forEach(game => {
        game.genres     = genres.filter(g => g.game_id === game.game_id).map(g => ({ id: g.id, name: g.name }));
        game.platforms  = platforms.filter(p => p.game_id === game.game_id).map(p => ({ id: p.id, name: p.name }));
        game.publishers = publishers.filter(p => p.game_id === game.game_id).map(p => ({ id: p.id, name: p.name }));
        game.developers = developers.filter(d => d.game_id === game.game_id).map(d => ({ id: d.id, name: d.name }));
      });

      res.json({ games: userGames });
    } catch (error) {
      console.error('Get user games error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // PUT /user/games/:gameId — Update a game in collection
  router.put('/games/:gameId', verifyToken, checkBanned, async (req, res) => {
    try {
      const { status, score } = req.body;
      const userGame = await db('user_game_lists')
        .where({ user_id: req.userId, game_id: req.params.gameId })
        .first();
      if (!userGame) return res.status(404).json({ error: 'Game not found in your list' });

      await db('user_game_lists')
        .where({ user_id: req.userId, game_id: req.params.gameId })
        .update({
          status: status || userGame.status,
          score: score !== undefined ? score : userGame.score,
          updated_at: db.fn.now()
        });

      res.json({ message: 'Game updated successfully' });
    } catch (error) {
      console.error('Update game error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /user/games/:gameId — Remove game from collection
  router.delete('/games/:gameId', verifyToken, checkBanned, async (req, res) => {
    try {
      const deleted = await db('user_game_lists')
        .where({ user_id: req.userId, game_id: req.params.gameId })
        .del();
      if (!deleted) return res.status(404).json({ error: 'Game not found in your list' });
      res.json({ message: 'Game removed successfully' });
    } catch (error) {
      console.error('Delete game error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // GET /user/stats — Collection statistics
  router.get('/stats', verifyToken, checkBanned, async (req, res) => {
    try {
      const stats = await db('user_game_lists')
        .where('user_id', req.userId)
        .select(
          db.raw('COUNT(*) as total_games'),
          db.raw('COUNT(CASE WHEN status = "completed" THEN 1 END) as completed'),
          db.raw('COUNT(CASE WHEN status = "playing" THEN 1 END) as playing'),
          db.raw('COUNT(CASE WHEN status = "plan_to_play" THEN 1 END) as plan_to_play'),
          db.raw('COUNT(CASE WHEN status = "on_hold" THEN 1 END) as on_hold'),
          db.raw('COUNT(CASE WHEN status = "dropped" THEN 1 END) as dropped'),
          db.raw('ROUND(AVG(CASE WHEN score IS NOT NULL THEN score END), 2) as mean_score')
        )
        .first();
      res.json(stats);
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOM LISTS ROUTES
  // ═══════════════════════════════════════════════════════════════════════

  // GET /user/lists — All custom lists for the logged-in user
  router.get('/lists', verifyToken, checkBanned, async (req, res) => {
    try {
      const lists = await db('custom_lists')
        .where({ user_id: req.userId })
        .orderBy('created_at', 'desc');

      if (lists.length === 0) return res.json({ lists: [] });

      const listIds = lists.map(l => l.id);

      const counts = await db('custom_list_games')
        .whereIn('list_id', listIds)
        .groupBy('list_id')
        .select('list_id', db.raw('COUNT(*) as game_count'));

      const covers = await db('custom_list_games')
        .join('games', 'custom_list_games.game_id', 'games.id')
        .whereIn('custom_list_games.list_id', listIds)
        .whereNotNull('games.background_image')
        .orderBy('custom_list_games.position', 'asc')
        .select('custom_list_games.list_id', 'games.background_image');

      const coversByList = {};
      covers.forEach(c => {
        if (!coversByList[c.list_id]) coversByList[c.list_id] = [];
        if (coversByList[c.list_id].length < 4) coversByList[c.list_id].push(c.background_image);
      });

      const countMap = {};
      counts.forEach(c => { countMap[c.list_id] = c.game_count; });

      res.json({
        lists: lists.map(l => ({
          ...l,
          game_count:   countMap[l.id] || 0,
          cover_images: coversByList[l.id] || []
        }))
      });
    } catch (error) {
      console.error('Get custom lists error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /user/lists/:listId — Single list with its games
  router.get('/lists/:listId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists').where({ id: req.params.listId }).first();
      if (!list) return res.status(404).json({ error: 'List not found' });
      if (list.user_id !== req.userId && !list.is_public)
        return res.status(403).json({ error: 'This list is private' });

      // ── Join custom_list_games → games, pulling status & score from clg ──
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
          // NEW: status & score live on custom_list_games
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
      console.error('Get list detail error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /user/lists — Create a new list
  router.post('/lists', verifyToken, checkBanned, async (req, res) => {
    try {
      const { name, description, cover_color, is_public } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'List name is required' });
      if (name.trim().length > 100) return res.status(400).json({ error: 'List name must be 100 characters or less' });

      const countResult = await db('custom_lists')
        .where({ user_id: req.userId })
        .count('id as cnt')
        .first();
      if (countResult.cnt >= 50) return res.status(400).json({ error: 'You can have at most 50 custom lists' });

      const slug = await getUniqueListSlug(req.userId, name.trim());

      const [listId] = await db('custom_lists').insert({
        user_id:     req.userId,
        name:        name.trim(),
        slug,
        description: description ? description.trim() : null,
        cover_color: cover_color || '#3a7bd5',
        is_public:   is_public !== undefined ? (is_public ? 1 : 0) : 1
      });

      const newList = await db('custom_lists').where({ id: listId }).first();
      res.status(201).json({ list: { ...newList, game_count: 0, cover_images: [] } });
    } catch (error) {
      console.error('Create list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /user/lists/:listId — Update a list's metadata
  router.put('/lists/:listId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      const { name, description, cover_color, is_public } = req.body;
      const updates = {};

      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: 'List name cannot be empty' });
        if (name.trim().length > 100) return res.status(400).json({ error: 'List name must be 100 characters or less' });
        updates.name = name.trim();
        updates.slug = await getUniqueListSlug(req.userId, name.trim(), list.id);
      }
      if (description !== undefined) updates.description = description ? description.trim() : null;
      if (cover_color  !== undefined) updates.cover_color = cover_color;
      if (is_public    !== undefined) updates.is_public   = is_public ? 1 : 0;

      await db('custom_lists').where({ id: list.id }).update(updates);
      const updated = await db('custom_lists').where({ id: list.id }).first();
      res.json({ list: updated });
    } catch (error) {
      console.error('Update list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /user/lists/:listId — Delete a list
  router.delete('/lists/:listId', verifyToken, checkBanned, async (req, res) => {
    try {
      const deleted = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .del();
      if (!deleted) return res.status(404).json({ error: 'List not found' });
      res.json({ message: 'List deleted successfully' });
    } catch (error) {
      console.error('Delete list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /user/lists/:listId/games — Add a game to a custom list
  router.post('/lists/:listId/games', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      // Accept status & score alongside game_id and note
      const { game_id, note, status, score } = req.body;
      if (!game_id) return res.status(400).json({ error: 'game_id is required' });

      const game = await db('games').where({ id: game_id }).first();
      if (!game) return res.status(404).json({ error: 'Game not found' });

      const existing = await db('custom_list_games')
        .where({ list_id: list.id, game_id })
        .first();
      if (existing) return res.status(400).json({ error: 'Game already in this list' });

      const maxPos = await db('custom_list_games')
        .where({ list_id: list.id })
        .max('position as maxPos')
        .first();
      const position = (maxPos.maxPos || 0) + 1;

      // Validate score if provided
      if (score !== undefined && score !== null && (score < 1 || score > 10)) {
        return res.status(400).json({ error: 'Score must be between 1 and 10' });
      }

      // Validate status if provided
      const validStatuses = ['playing', 'completed', 'plan_to_play', 'on_hold', 'dropped'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      await db('custom_list_games').insert({
        list_id:  list.id,
        game_id,
        note:     note ? note.trim() : null,
        position,
        status:   status || null,
        score:    score  || null
      });

      res.status(201).json({ message: 'Game added to list' });
    } catch (error) {
      console.error('Add game to list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /user/lists/:listId/games/:gameId — Update status, score, or note for a game in a list
  router.put('/lists/:listId/games/:gameId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      const { note, status, score } = req.body;

      // Validate score if provided
      if (score !== undefined && score !== null && (score < 1 || score > 10)) {
        return res.status(400).json({ error: 'Score must be between 1 and 10' });
      }

      // Validate status if provided
      const validStatuses = ['playing', 'completed', 'plan_to_play', 'on_hold', 'dropped'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      const updateData = {};
      if (note     !== undefined) updateData.note   = note ? note.trim() : null;
      if (status   !== undefined) updateData.status = status || null;
      if (score    !== undefined) updateData.score  = score  || null;

      const updated = await db('custom_list_games')
        .where({ list_id: list.id, game_id: req.params.gameId })
        .update(updateData);

      if (!updated) return res.status(404).json({ error: 'Game not found in this list' });
      res.json({ message: 'Updated successfully' });
    } catch (error) {
      console.error('Update game in list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /user/lists/:listId/games/:gameId — Remove a game from a list
  router.delete('/lists/:listId/games/:gameId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      const deleted = await db('custom_list_games')
        .where({ list_id: list.id, game_id: req.params.gameId })
        .del();
      if (!deleted) return res.status(404).json({ error: 'Game not found in this list' });
      res.json({ message: 'Game removed from list' });
    } catch (error) {
      console.error('Remove game from list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};