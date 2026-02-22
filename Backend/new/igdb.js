const express = require('express');
const fetch = require('node-fetch');

module.exports = () => {
  const router = express.Router();

  const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
  const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

  // Log credentials status (without exposing actual values)
  console.log('IGDB Proxy initialized:');
  console.log('  Client ID:', IGDB_CLIENT_ID ? '✓ Set' : '✗ Missing');
  console.log('  Access Token:', IGDB_ACCESS_TOKEN ? '✓ Set' : '✗ Missing');

  // Rate limiting
  let lastAPICall = 0;
  const MIN_API_DELAY = 250; // 4 requests/second

  async function respectRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - lastAPICall;
    
    if (timeSinceLastCall < MIN_API_DELAY) {
      const waitTime = MIN_API_DELAY - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastAPICall = Date.now();
  }

  // Proxy for IGDB games endpoint
  router.post('/games', async (req, res) => {
    console.log('\n📡 IGDB Games Request');
    
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        console.error('❌ IGDB credentials missing!');
        return res.status(500).json({ 
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      console.log('Calling IGDB API...');
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept': 'application/json'
        },
        body: req.body.query
      });

      console.log('IGDB Response Status:', response.status);
      
      const data = await response.json();

      if (response.ok) {
        console.log('✅ IGDB Games fetched:', data.length, 'games');
        res.json(data);
      } else {
        console.error('❌ IGDB API Error:', response.status);
        console.error('Error details:', JSON.stringify(data, null, 2));
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('❌ IGDB Proxy Error:', error.message);
      console.error('Full error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch from IGDB',
        message: error.message 
      });
    }
  });

  // Proxy for IGDB genres endpoint
  router.post('/genres', async (req, res) => {
    console.log('\n📡 IGDB Genres Request');
    
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        console.error('❌ IGDB credentials missing!');
        return res.status(500).json({ 
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      const query = req.body.query || 'fields name; limit 50; sort name asc;';
      console.log('Query:', query);
      
      const response = await fetch('https://api.igdb.com/v4/genres', {
        method: 'POST',
        headers: {
          'Client-ID': IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept': 'application/json'
        },
        body: query
      });

      console.log('IGDB Response Status:', response.status);
      
      const data = await response.json();

      if (response.ok) {
        console.log('✅ IGDB Genres fetched:', data.length, 'genres');
        res.json(data);
      } else {
        console.error('❌ IGDB API Error:', response.status);
        console.error('Error details:', JSON.stringify(data, null, 2));
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('❌ IGDB Genres Error:', error.message);
      console.error('Full error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch genres from IGDB',
        message: error.message 
      });
    }
  });

  // Proxy for IGDB platforms endpoint
  router.post('/platforms', async (req, res) => {
    console.log('\n📡 IGDB Platforms Request');
    
    try {
      if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        console.error('❌ IGDB credentials missing!');
        return res.status(500).json({ 
          error: 'IGDB credentials not configured',
          message: 'Please set IGDB_CLIENT_ID and IGDB_ACCESS_TOKEN in .env file'
        });
      }

      await respectRateLimit();

      const query = req.body.query || 'fields name; where category = (1,5,6); limit 100; sort name asc;';
      console.log('Query:', query);
      
      const response = await fetch('https://api.igdb.com/v4/platforms', {
        method: 'POST',
        headers: {
          'Client-ID': IGDB_CLIENT_ID,
          'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
          'Accept': 'application/json'
        },
        body: query
      });

      console.log('IGDB Response Status:', response.status);
      
      const data = await response.json();

      if (response.ok) {
        console.log('✅ IGDB Platforms fetched:', data.length, 'platforms');
        res.json(data);
      } else {
        console.error('❌ IGDB API Error:', response.status);
        console.error('Error details:', JSON.stringify(data, null, 2));
        res.status(response.status).json({ error: 'IGDB API error', details: data });
      }
    } catch (error) {
      console.error('❌ IGDB Platforms Error:', error.message);
      console.error('Full error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch platforms from IGDB',
        message: error.message 
      });
    }
  });

  return router;
};