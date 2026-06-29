const express = require('express');
const fetch   = require('node-fetch');

module.exports = () => {
  const router = express.Router();

  const RAWG_API_KEY = process.env.RAWG_API_KEY;
  const RAWG_BASE    = 'https://api.rawg.io/api';

  let lastAPICall = 0;
  const MIN_API_DELAY = 100;

  async function respectRateLimit() {
    const now  = Date.now();
    const wait = MIN_API_DELAY - (now - lastAPICall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastAPICall = Date.now();
  }

  function ensureKey(res) {
    if (!RAWG_API_KEY) {
      res.status(500).json({
        error:   'RAWG credentials not configured',
        message: 'Please set RAWG_API_KEY in .env file'
      });
      return false;
    }
    return true;
  }

  function buildUrl(path, params) {
    const url = new URL(RAWG_BASE + path);
    url.searchParams.set('key', RAWG_API_KEY);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });
    return url.toString();
  }

  async function rawgFetch(path, params, res, label) {
    if (!ensureKey(res)) return null;
    await respectRateLimit();

    const url      = buildUrl(path, params);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data     = await response.json();

    if (!response.ok) {
      console.error(`RAWG ${label} error ${response.status}:`, data);
      res.status(response.status).json({ error: 'RAWG API error', details: data });
      return null;
    }
    return data;
  }

  router.get('/games', async (req, res) => {
    try {
      const params = {
        search:            req.query.search,
        search_precise:    req.query.search_precise,
        search_exact:      req.query.search_exact,
        genres:            req.query.genres,
        platforms:         req.query.platforms,
        parent_platforms:  req.query.parent_platforms,
        publishers:        req.query.publishers,
        developers:        req.query.developers,
        tags:              req.query.tags,
        dates:             req.query.dates,
        ordering:          req.query.ordering || '-released',
        page:              req.query.page      || 1,
        page_size:         req.query.page_size || 20,
        exclude_additions: req.query.exclude_additions
      };

      const data = await rawgFetch('/games', params, res, 'games');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Games Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch from RAWG', message: error.message });
    }
  });

  router.get('/games/:id', async (req, res) => {
    try {
      const data = await rawgFetch(
        `/games/${encodeURIComponent(req.params.id)}`,
        {},
        res,
        'game detail'
      );
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Game Detail Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch game from RAWG', message: error.message });
    }
  });

  router.get('/games/:id/screenshots', async (req, res) => {
    try {
      const data = await rawgFetch(
        `/games/${encodeURIComponent(req.params.id)}/screenshots`,
        { page_size: req.query.page_size || 10 },
        res,
        'screenshots'
      );
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Screenshots Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch screenshots from RAWG', message: error.message });
    }
  });

  router.get('/genres', async (req, res) => {
    try {
      const data = await rawgFetch('/genres', {
        page:      req.query.page      || 1,
        page_size: req.query.page_size || 40,
        ordering:  req.query.ordering  || 'name'
      }, res, 'genres');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Genres Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch genres from RAWG', message: error.message });
    }
  });

  router.get('/platforms', async (req, res) => {
    try {
      const data = await rawgFetch('/platforms', {
        page:      req.query.page      || 1,
        page_size: req.query.page_size || 50,
        ordering:  req.query.ordering  || 'name'
      }, res, 'platforms');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Platforms Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch platforms from RAWG', message: error.message });
    }
  });

  router.get('/platforms/parents', async (req, res) => {
    try {
      const data = await rawgFetch('/platforms/lists/parents', {
        page_size: req.query.page_size || 20
      }, res, 'parent platforms');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Parent Platforms Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch parent platforms', message: error.message });
    }
  });

  router.get('/publishers', async (req, res) => {
    try {
      const data = await rawgFetch('/publishers', {
        page:      req.query.page      || 1,
        page_size: req.query.page_size || 40,
        ordering:  req.query.ordering  || '-games_count'
      }, res, 'publishers');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Publishers Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch publishers from RAWG', message: error.message });
    }
  });

  router.get('/developers', async (req, res) => {
    try {
      const data = await rawgFetch('/developers', {
        page:      req.query.page      || 1,
        page_size: req.query.page_size || 40,
        ordering:  req.query.ordering  || '-games_count'
      }, res, 'developers');
      if (data) res.json(data);
    } catch (error) {
      console.error('RAWG Developers Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch developers from RAWG', message: error.message });
    }
  });

  return router;
};
