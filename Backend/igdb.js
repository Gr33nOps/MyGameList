const express = require('express');
const fetch = require('node-fetch');

module.exports = () => {
  const router = express.Router();

  const IGDB_CLIENT_ID   = process.env.IGDB_CLIENT_ID;
  const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

  let lastAPICall = 0;
  const MIN_API_DELAY = 250;

  async function respectRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - lastAPICall;

    if (timeSinceLastCall < MIN_API_DELAY) {
      const waitTime = MIN_API_DELAY - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastAPICall = Date.now();
  }

  router.post('/games', async (req, res) => {
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        return res.status(500).json({
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID':     IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept':        'application/json'
        },
        body: req.body.query
      });

      const data = await response.json();

      if (response.ok) {
        res.json(data);
      } else {
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('IGDB Proxy Error:', error.message);
      res.status(500).json({
        error: 'Failed to fetch from IGDB',
        message: error.message
      });
    }
  });

  router.post('/genres', async (req, res) => {
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        return res.status(500).json({
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      const query = req.body.query || 'fields name; limit 50; sort name asc;';

      const response = await fetch('https://api.igdb.com/v4/genres', {
        method: 'POST',
        headers: {
          'Client-ID':     IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept':        'application/json'
        },
        body: query
      });

      const data = await response.json();

      if (response.ok) {
        res.json(data);
      } else {
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('IGDB Genres Error:', error.message);
      res.status(500).json({
        error: 'Failed to fetch genres from IGDB',
        message: error.message
      });
    }
  });

  router.post('/platforms', async (req, res) => {
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        return res.status(500).json({
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      const query = req.body.query || 'fields name; where category = (1,5,6); limit 100; sort name asc;';

      const response = await fetch('https://api.igdb.com/v4/platforms', {
        method: 'POST',
        headers: {
          'Client-ID':     IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept':        'application/json'
        },
        body: query
      });

      const data = await response.json();

      if (response.ok) {
        res.json(data);
      } else {
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('IGDB Platforms Error:', error.message);
      res.status(500).json({
        error: 'Failed to fetch platforms from IGDB',
        message: error.message
      });
    }
  });

  return router;
};