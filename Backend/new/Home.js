const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // REMOVED: Get IGDB API credentials endpoint
  // This was a security risk - credentials should never be exposed to frontend
  // IGDB API calls are now proxied through /api/igdb/* endpoints

  // Get all games with filters
  router.get('/games', async (req, res) => {
    try {
      const { 
        search, 
        releaseYear, 
        publisher, 
        developer, 
        platform, 
        genre, 
        limit = 20, 
        offset = 0, 
        sort = 'rating',
        order = 'desc'
      } = req.query;

      let query = db('games')
        .select(
          'games.id',
          'games.name',
          'games.background_image',
          'games.rating',
          'games.description',
          db.raw("DATE_FORMAT(games.released, '%Y') as release_year"),
          'games.released'
        );

      if (search) {
        query = query.where('games.name', 'like', `%${search}%`);
      }

      if (releaseYear) {
        query = query.whereRaw('YEAR(games.released) = ?', [releaseYear]);
      }

      if (publisher) {
        query = query
          .join('game_publishers', 'games.id', 'game_publishers.game_id')
          .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
          .where('publishers.name', publisher);
      }

      if (developer) {
        query = query
          .join('game_developers', 'games.id', 'game_developers.game_id')
          .join('developers', 'game_developers.developer_id', 'developers.id')
          .where('developers.name', developer);
      }

      if (platform) {
        query = query
          .join('game_platforms', 'games.id', 'game_platforms.game_id')
          .join('platforms', 'game_platforms.platform_id', 'platforms.id')
          .where('platforms.name', platform);
      }

      if (genre) {
        query = query
          .join('game_genres', 'games.id', 'game_genres.game_id')
          .join('genres', 'game_genres.genre_id', 'genres.id')
          .where('genres.name', genre);
      }

      const sortOrder = order.toLowerCase() === 'asc' ? 'asc' : 'desc';

      switch (sort) {
        case 'name':
          query = query.orderBy('games.name', sortOrder);
          break;
        case 'release':
          query = query.orderBy('games.released', sortOrder);
          break;
        case 'created_at':
          query = query.orderBy('games.created_at', sortOrder);
          break;
        case 'id':
          query = query.orderBy('games.id', sortOrder);
          break;
        case 'rating':
        default:
          query = query.orderBy('games.rating', sortOrder);
          if (sortOrder === 'desc') {
            query = query.orderBy('games.name', 'asc');
          }
          break;
      }
      
      query = query.groupBy('games.id');

      const parsedLimit = parseInt(limit);
      const parsedOffset = parseInt(offset);
      
      if (parsedLimit > 0) {
        query = query.limit(parsedLimit).offset(parsedOffset);
      }

      let countQuery = db('games').count('games.id as total');
      
      if (search) {
        countQuery = countQuery.where('games.name', 'like', `%${search}%`);
      }
      if (releaseYear) {
        countQuery = countQuery.whereRaw('YEAR(games.released) = ?', [releaseYear]);
      }
      if (publisher) {
        countQuery = countQuery
          .join('game_publishers', 'games.id', 'game_publishers.game_id')
          .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
          .where('publishers.name', publisher);
      }
      if (developer) {
        countQuery = countQuery
          .join('game_developers', 'games.id', 'game_developers.game_id')
          .join('developers', 'game_developers.developer_id', 'developers.id')
          .where('developers.name', developer);
      }
      if (platform) {
        countQuery = countQuery
          .join('game_platforms', 'games.id', 'game_platforms.game_id')
          .join('platforms', 'game_platforms.platform_id', 'platforms.id')
          .where('platforms.name', platform);
      }
      if (genre) {
        countQuery = countQuery
          .join('game_genres', 'games.id', 'game_genres.game_id')
          .join('genres', 'game_genres.genre_id', 'genres.id')
          .where('genres.name', genre);
      }

      const [games, totalResult] = await Promise.all([
        query,
        countQuery.first()
      ]);

      const total = totalResult?.total || 0;
      const gameIds = games.map(game => game.id);

      if (gameIds.length === 0) {
        return res.json({ 
          games: [], 
          total: 0,
          hasMore: false 
        });
      }

      const [genres, publishers, developers, platforms] = await Promise.all([
        db('game_genres')
          .join('genres', 'game_genres.genre_id', 'genres.id')
          .whereIn('game_genres.game_id', gameIds)
          .select('game_genres.game_id', 'genres.id', 'genres.name'),
        
        db('game_publishers')
          .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
          .whereIn('game_publishers.game_id', gameIds)
          .select('game_publishers.game_id', 'publishers.id', 'publishers.name'),
        
        db('game_developers')
          .join('developers', 'game_developers.developer_id', 'developers.id')
          .whereIn('game_developers.game_id', gameIds)
          .select('game_developers.game_id', 'developers.id', 'developers.name'),
        
        db('game_platforms')
          .join('platforms', 'game_platforms.platform_id', 'platforms.id')
          .whereIn('game_platforms.game_id', gameIds)
          .select('game_platforms.game_id', 'platforms.id', 'platforms.name')
      ]);

      games.forEach(game => {
        game.genres = genres.filter(g => g.game_id === game.id).map(g => ({ id: g.id, name: g.name }));
        game.publishers = publishers.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
        game.developers = developers.filter(d => d.game_id === game.id).map(d => ({ id: d.id, name: d.name }));
        game.platforms = platforms.filter(p => p.game_id === game.id).map(p => ({ id: p.id, name: p.name }));
      });

      res.json({ 
        games,
        total,
        hasMore: parsedLimit > 0 && (parsedOffset + parsedLimit) < total
      });
    } catch (error) {
      console.error('Games API Error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get single game details
  router.get('/games/:id', async (req, res) => {
    try {
      const game = await db('games')
        .where({ id: req.params.id })
        .select(
          'id', 'name', 'description', 'background_image', 
          'rating', 'metacritic_score', 'playtime', 'igdb_id',
          db.raw("DATE_FORMAT(released, '%Y-%m-%d') as released")
        )
        .first();
      
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const [genres, publishers, developers, platforms] = await Promise.all([
        db('game_genres')
          .join('genres', 'game_genres.genre_id', 'genres.id')
          .where('game_genres.game_id', game.id)
          .select('genres.id', 'genres.name'),
        
        db('game_publishers')
          .join('publishers', 'game_publishers.publisher_id', 'publishers.id')
          .where('game_publishers.game_id', game.id)
          .select('publishers.id', 'publishers.name'),
        
        db('game_developers')
          .join('developers', 'game_developers.developer_id', 'developers.id')
          .where('game_developers.game_id', game.id)
          .select('developers.id', 'developers.name'),
        
        db('game_platforms')
          .join('platforms', 'game_platforms.platform_id', 'platforms.id')
          .where('game_platforms.game_id', game.id)
          .select('platforms.id', 'platforms.name')
      ]);

      game.genres = genres;
      game.publishers = publishers;
      game.developers = developers;
      game.platforms = platforms;

      res.json(game);
    } catch (error) {
      console.error('Game Details API Error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};