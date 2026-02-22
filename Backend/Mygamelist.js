const express = require('express');

module.exports = (db, verifyToken, checkBanned) => {
  const router = express.Router();

  function generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function getOrCreateEntities(table, names) {
    if (!names || names.length === 0) return new Map();

    const unique = [...new Set(names.filter(Boolean))];

    const existing = await db(table).whereIn('name', unique).select('id', 'name');
    const resultMap = new Map(existing.map(e => [e.name, e.id]));

    const missing = unique.filter(n => !resultMap.has(n));
    if (missing.length > 0) {
      const rows = missing.map(name => ({ name, slug: generateSlug(name) || name }));

      await db.raw(
        `INSERT INTO ${table} (name, slug) VALUES ${rows.map(() => '(?, ?)').join(', ')} ON CONFLICT (name) DO NOTHING`,
        rows.flatMap(r => [r.name, r.slug])
      );

      const inserted = await db(table).whereIn('name', missing).select('id', 'name');
      inserted.forEach(e => resultMap.set(e.name, e.id));
    }

    return resultMap;
  }

  async function ensureGameExists(gameData) {
    try {
      if (gameData.igdb_id) {
        const existing = await db('games').where({ igdb_id: gameData.igdb_id }).first();
        if (existing) return existing.id;
      }

      const existingByName = await db('games').where({ name: gameData.name }).first();
      if (existingByName) {
        if (!existingByName.igdb_id && gameData.igdb_id) {
          await db('games').where({ id: existingByName.id }).update({ igdb_id: gameData.igdb_id });
        }
        return existingByName.id;
      }

      const gameTextId = gameData.igdb_id
        ? `igdb_${gameData.igdb_id}`
        : (gameData.game_id || `igdb_${Date.now()}`);

      const slug = generateSlug(gameData.name);
      let gameIntId;

      try {
        const [row] = await db('games').insert({
          game_id:          gameTextId,
          igdb_id:          gameData.igdb_id          || null,
          name:             gameData.name,
          slug:             slug                       || gameData.name,
          description:      gameData.description       || null,
          background_image: gameData.background_image  || null,
          rating:           gameData.rating            || null,
          metacritic_score: gameData.metacritic_score  || null,
          released:         gameData.released          || null,
          playtime:         gameData.playtime          || 0,
          genres:           JSON.stringify(gameData.genres     || []),
          platforms:        JSON.stringify(gameData.platforms  || []),
          publishers:       JSON.stringify(gameData.publishers || []),
          developers:       JSON.stringify(gameData.developers || []),
        }).returning('id');
        gameIntId = row.id ?? row;
      } catch {
        const uniqueSlug = `${slug}-${Date.now()}`;
        const [row] = await db('games').insert({
          game_id:          gameTextId,
          igdb_id:          gameData.igdb_id          || null,
          name:             gameData.name,
          slug:             uniqueSlug,
          description:      gameData.description       || null,
          background_image: gameData.background_image  || null,
          rating:           gameData.rating            || null,
          metacritic_score: gameData.metacritic_score  || null,
          released:         gameData.released          || null,
          playtime:         gameData.playtime          || 0,
          genres:           JSON.stringify(gameData.genres     || []),
          platforms:        JSON.stringify(gameData.platforms  || []),
          publishers:       JSON.stringify(gameData.publishers || []),
          developers:       JSON.stringify(gameData.developers || []),
        }).returning('id');
        gameIntId = row.id ?? row;
      }

      const genreNames     = (gameData.genres     || []).map(g => g.name).filter(Boolean);
      const platformNames  = (gameData.platforms  || []).map(p => p.name).filter(Boolean);
      const publisherNames = (gameData.publishers || []).map(p => p.name).filter(Boolean);
      const developerNames = (gameData.developers || []).map(d => d.name).filter(Boolean);

      const [genreMap, platformMap, publisherMap, developerMap] = await Promise.all([
        getOrCreateEntities('genres',     genreNames),
        getOrCreateEntities('platforms',  platformNames),
        getOrCreateEntities('publishers', publisherNames),
        getOrCreateEntities('developers', developerNames),
      ]);

      const junctionInserts = [];

      if (genreNames.length) {
        const rows = genreNames.map(n => ({ game_id: gameIntId, genre_id: genreMap.get(n) })).filter(r => r.genre_id);
        if (rows.length) junctionInserts.push(
          db.raw(`INSERT INTO game_genres (game_id, genre_id) VALUES ${rows.map(() => '(?,?)').join(',')} ON CONFLICT DO NOTHING`, rows.flatMap(r => [r.game_id, r.genre_id]))
        );
      }
      if (platformNames.length) {
        const rows = platformNames.map(n => ({ game_id: gameIntId, platform_id: platformMap.get(n) })).filter(r => r.platform_id);
        if (rows.length) junctionInserts.push(
          db.raw(`INSERT INTO game_platforms (game_id, platform_id) VALUES ${rows.map(() => '(?,?)').join(',')} ON CONFLICT DO NOTHING`, rows.flatMap(r => [r.game_id, r.platform_id]))
        );
      }
      if (publisherNames.length) {
        const rows = publisherNames.map(n => ({ game_id: gameIntId, publisher_id: publisherMap.get(n) })).filter(r => r.publisher_id);
        if (rows.length) junctionInserts.push(
          db.raw(`INSERT INTO game_publishers (game_id, publisher_id) VALUES ${rows.map(() => '(?,?)').join(',')} ON CONFLICT DO NOTHING`, rows.flatMap(r => [r.game_id, r.publisher_id]))
        );
      }
      if (developerNames.length) {
        const rows = developerNames.map(n => ({ game_id: gameIntId, developer_id: developerMap.get(n) })).filter(r => r.developer_id);
        if (rows.length) junctionInserts.push(
          db.raw(`INSERT INTO game_developers (game_id, developer_id) VALUES ${rows.map(() => '(?,?)').join(',')} ON CONFLICT DO NOTHING`, rows.flatMap(r => [r.game_id, r.developer_id]))
        );
      }

      await Promise.all(junctionInserts);

      return gameIntId;
    } catch (error) {
      console.error('Error ensuring game exists:', error);
      throw error;
    }
  }

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
      if (existing) return res.status(400).json({ error: 'Game already in your list', game_id: dbGameId });

      await db('user_game_lists').insert({
        user_id: req.userId,
        game_id: dbGameId,
        status:  status || 'plan_to_play',
        score:   score  || null
      });

      res.status(201).json({ message: 'Game added successfully', game_id: dbGameId });
    } catch (error) {
      console.error('Add game error:', error);
      res.status(400).json({ error: error.message });
    }
  });

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
        case 'name':   query = query.orderBy('games.name', sortOrder); break;
        case 'rating': query = query.orderBy('games.rating', sortOrder); break;
        case 'score':  query = query.orderBy('user_game_lists.score', sortOrder); break;
        default:       query = query.orderBy('user_game_lists.created_at', sortOrder); break;
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
          status:     status !== undefined ? status : userGame.status,
          score:      score  !== undefined ? score  : userGame.score,
          updated_at: db.fn.now()
        });

      res.json({ message: 'Game updated successfully' });
    } catch (error) {
      console.error('Update game error:', error);
      res.status(400).json({ error: error.message });
    }
  });

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

  router.get('/stats', verifyToken, checkBanned, async (req, res) => {
    try {
      const stats = await db('user_game_lists')
        .where('user_id', req.userId)
        .select(
          db.raw('COUNT(*) as total_games'),
          db.raw(`COUNT(CASE WHEN status = 'completed'    THEN 1 END) as completed`),
          db.raw(`COUNT(CASE WHEN status = 'playing'      THEN 1 END) as playing`),
          db.raw(`COUNT(CASE WHEN status = 'plan_to_play' THEN 1 END) as plan_to_play`),
          db.raw(`COUNT(CASE WHEN status = 'on_hold'      THEN 1 END) as on_hold`),
          db.raw(`COUNT(CASE WHEN status = 'dropped'      THEN 1 END) as dropped`),
          db.raw('ROUND(AVG(CASE WHEN score IS NOT NULL THEN score END)::numeric, 2) as mean_score')
        )
        .first();

      res.json({
        total_games:  parseInt(stats.total_games)  || 0,
        completed:    parseInt(stats.completed)    || 0,
        playing:      parseInt(stats.playing)      || 0,
        plan_to_play: parseInt(stats.plan_to_play) || 0,
        on_hold:      parseInt(stats.on_hold)      || 0,
        dropped:      parseInt(stats.dropped)      || 0,
        mean_score:   stats.mean_score ? parseFloat(stats.mean_score) : null
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/lists', verifyToken, checkBanned, async (req, res) => {
    try {
      const lists = await db('custom_lists')
        .where({ user_id: req.userId })
        .orderBy('created_at', 'desc');

      if (lists.length === 0) return res.json({ lists: [] });

      const listIds = lists.map(l => l.id);

      const [counts, covers] = await Promise.all([
        db('custom_list_games')
          .whereIn('list_id', listIds)
          .groupBy('list_id')
          .select('list_id', db.raw('COUNT(*) as game_count')),

        db('custom_list_games')
          .join('games', 'custom_list_games.game_id', 'games.id')
          .whereIn('custom_list_games.list_id', listIds)
          .whereNotNull('games.background_image')
          .orderBy('custom_list_games.position', 'asc')
          .select('custom_list_games.list_id', 'games.background_image')
      ]);

      const coversByList = {};
      covers.forEach(c => {
        if (!coversByList[c.list_id]) coversByList[c.list_id] = [];
        if (coversByList[c.list_id].length < 4) coversByList[c.list_id].push(c.background_image);
      });

      const countMap = {};
      counts.forEach(c => { countMap[c.list_id] = parseInt(c.game_count) || 0; });

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

  router.get('/lists/:listId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists').where({ id: req.params.listId }).first();
      if (!list) return res.status(404).json({ error: 'List not found' });
      if (list.user_id !== req.userId && !list.is_public)
        return res.status(403).json({ error: 'This list is private' });

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
      console.error('Get list detail error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/lists', verifyToken, checkBanned, async (req, res) => {
    try {
      const { name, description, cover_color, is_public } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'List name is required' });
      if (name.trim().length > 100) return res.status(400).json({ error: 'List name must be 100 characters or less' });

      const countResult = await db('custom_lists')
        .where({ user_id: req.userId })
        .count('id as cnt')
        .first();
      if (parseInt(countResult.cnt) >= 50) return res.status(400).json({ error: 'You can have at most 50 custom lists' });

      const slug = await getUniqueListSlug(req.userId, name.trim());

      const [row] = await db('custom_lists').insert({
        user_id:     req.userId,
        name:        name.trim(),
        slug,
        description: description ? description.trim() : null,
        cover_color: cover_color || '#3a7bd5',
        is_public:   is_public !== undefined ? Boolean(is_public) : true
      }).returning('id');

      const listId = row.id ?? row;
      const newList = await db('custom_lists').where({ id: listId }).first();
      res.status(201).json({ list: { ...newList, game_count: 0, cover_images: [] } });
    } catch (error) {
      console.error('Create list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

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
      if (is_public    !== undefined) updates.is_public   = Boolean(is_public);

      await db('custom_lists').where({ id: list.id }).update(updates);
      const updated = await db('custom_lists').where({ id: list.id }).first();
      res.json({ list: updated });
    } catch (error) {
      console.error('Update list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

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

  router.post('/lists/:listId/games', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      const { game_id, game_data, note, status, score } = req.body;
      if (!game_id && !game_data) return res.status(400).json({ error: 'game_id or game_data is required' });

      if (score !== undefined && score !== null && (score < 1 || score > 10)) {
        return res.status(400).json({ error: 'Score must be between 1 and 10' });
      }
      const validStatuses = ['playing', 'completed', 'plan_to_play', 'on_hold', 'dropped'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      let dbGameId;
      if (game_data) {
        dbGameId = await ensureGameExists(game_data);
      } else {
        dbGameId = game_id;
        const game = await db('games').where({ id: dbGameId }).first();
        if (!game) return res.status(404).json({ error: 'Game not found' });
      }

      const existing = await db('custom_list_games')
        .where({ list_id: list.id, game_id: dbGameId })
        .first();
      if (existing) return res.status(400).json({ error: 'Game already in this list' });

      const maxPos = await db('custom_list_games')
        .where({ list_id: list.id })
        .max('position as maxPos')
        .first();
      const position = (maxPos.maxPos || 0) + 1;

      await db('custom_list_games').insert({
        list_id:  list.id,
        game_id:  dbGameId,
        user_id:  req.userId,
        note:     note   ? note.trim() : null,
        position,
        status:   status || null,
        score:    score  || null
      });

      res.status(201).json({ message: 'Game added to list', game_id: dbGameId });
    } catch (error) {
      console.error('Add game to list error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/lists/:listId/games/:gameId', verifyToken, checkBanned, async (req, res) => {
    try {
      const list = await db('custom_lists')
        .where({ id: req.params.listId, user_id: req.userId })
        .first();
      if (!list) return res.status(404).json({ error: 'List not found' });

      const { note, status, score } = req.body;

      if (score !== undefined && score !== null && (score < 1 || score > 10)) {
        return res.status(400).json({ error: 'Score must be between 1 and 10' });
      }

      const validStatuses = ['playing', 'completed', 'plan_to_play', 'on_hold', 'dropped'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      const updateData = {};
      if (note   !== undefined) updateData.note   = note   ? note.trim() : null;
      if (status !== undefined) updateData.status = status || null;
      if (score  !== undefined) updateData.score  = score  || null;

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