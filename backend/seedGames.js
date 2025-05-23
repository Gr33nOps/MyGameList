require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

const RAWG_API_KEY = process.env.RAWG_API_KEY;

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper: Insert or ignore a platform and return its ID
async function insertPlatform(name) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT platform_id FROM PLATFORM WHERE platform_name = ?', [name]);
    if (rows.length > 0) {
      return rows[0].platform_id;
    }
    const [result] = await conn.execute('INSERT INTO PLATFORM (platform_name) VALUES (?)', [name]);
    return result.insertId;
  } finally {
    conn.release();
  }
}

// Helper: Insert or ignore a genre and return its ID
async function insertGenre(name) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute('SELECT genre_id FROM GENRE WHERE genre_name = ?', [name]);
    if (rows.length > 0) {
      return rows[0].genre_id;
    }
    const [result] = await conn.execute('INSERT INTO GENRE (genre_name) VALUES (?)', [name]);
    return result.insertId;
  } finally {
    conn.release();
  }
}

// Insert game and related platforms and genres
async function insertGame(game) {
  const conn = await pool.getConnection();
  try {
    // Check if game exists
    const [existing] = await conn.execute('SELECT game_id FROM GAME WHERE title = ?', [game.name]);
    if (existing.length > 0) {
      return existing[0].game_id;
    }

    // Insert game
    const [result] = await conn.execute(
      `INSERT INTO GAME (title, developer, release_year, cover_art_url, description, avg_rating, rating_count) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        game.name,
        game.developer || 'Unknown',
        game.released ? new Date(game.released).getFullYear() : null,
        game.background_image || null,
        game.description_raw || '',
        game.rating || 0,
        game.ratings_count || 0,
      ]
    );

    const gameId = result.insertId;

    // Insert platforms
    if (game.platforms) {
      for (const plat of game.platforms) {
        const platformId = await insertPlatform(plat.platform.name);
        await conn.execute('INSERT IGNORE INTO GAME_PLATFORM (game_id, platform_id) VALUES (?, ?)', [gameId, platformId]);
      }
    }

    // Insert genres
    if (game.genres) {
      for (const genre of game.genres) {
        const genreId = await insertGenre(genre.name);
        await conn.execute('INSERT IGNORE INTO GAME_GENRE (game_id, genre_id) VALUES (?, ?)', [gameId, genreId]);
      }
    }

    return gameId;
  } finally {
    conn.release();
  }
}

// Fetch multiple pages of games from RAWG and insert into DB
async function seedGames() {
  console.log('Starting seeding...');

  let page = 1;
  const pageSize = 20; // max 40 by RAWG, 20 is safe for demonstration

  while (page <= 5) { // For demo: fetch 5 pages (100 games)
    console.log(`Fetching page ${page}...`);

    const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&page=${page}&page_size=${pageSize}`;
    const response = await axios.get(url);

    const games = response.data.results;

    for (const game of games) {
      try {
        await insertGame(game);
        console.log(`Inserted game: ${game.name}`);
      } catch (err) {
        console.error(`Error inserting game ${game.name}:`, err.message);
      }
    }

    page++;
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seedGames().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
