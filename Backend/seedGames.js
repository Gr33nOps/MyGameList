const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const startPage = parseInt(process.argv[2]) || 1;
const pagesToSeed = parseInt(process.argv[3]) || 5;

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// RAWG API configuration
const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = 'https://api.rawg.io/api';
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay to respect rate limits

class GameSeeder {
    constructor() {
        this.connection = null;
        this.processedGames = new Set();
        this.processedPublishers = new Set();
        this.processedDevelopers = new Set();
        this.processedPlatforms = new Set();
        this.processedGenres = new Set();
        this.processedTags = new Set();
        this.processedStores = new Set();
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(dbConfig);
            console.log('✅ Connected to MySQL database');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            console.log('✅ Database connection closed');
        }
    }

    // Utility function to add delay between API requests
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Fetch games from RAWG API with pagination
    async fetchGamesFromRAWG(page = 1, pageSize = 40) {
        try {
            const response = await axios.get(`${RAWG_BASE_URL}/games`, {
                params: {
                    key: RAWG_API_KEY,
                    page: page,
                    page_size: pageSize,
                    ordering: '-rating,-metacritic',
                    metacritic: '70,100' // Only games with good ratings
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching games from page ${page}:`, error.message);
            return null;
        }
    }

    // Fetch detailed game information
    async fetchGameDetails(gameId) {
        try {
            const response = await axios.get(`${RAWG_BASE_URL}/games/${gameId}`, {
                params: {
                    key: RAWG_API_KEY
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching game details for ID ${gameId}:`, error.message);
            return null;
        }
    }

    // Fetch game screenshots
    async fetchGameScreenshots(gameId) {
        try {
            const response = await axios.get(`${RAWG_BASE_URL}/games/${gameId}/screenshots`, {
                params: {
                    key: RAWG_API_KEY
                }
            });
            return response.data.results || [];
        } catch (error) {
            console.error(`❌ Error fetching screenshots for game ID ${gameId}:`, error.message);
            return [];
        }
    }

    // Insert or get publisher
    async insertPublisher(publisher) {
        if (!publisher || this.processedPublishers.has(publisher.id)) {
            return this.processedPublishers.has(publisher.id) ? publisher.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO publishers (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [publisher.id, publisher.name, publisher.slug]
            );
            
            this.processedPublishers.add(publisher.id);
            return publisher.id;
        } catch (error) {
            console.error('❌ Error inserting publisher:', error.message);
            return null;
        }
    }

    // Insert or get developer
    async insertDeveloper(developer) {
        if (!developer || this.processedDevelopers.has(developer.id)) {
            return this.processedDevelopers.has(developer.id) ? developer.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO developers (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [developer.id, developer.name, developer.slug]
            );
            
            this.processedDevelopers.add(developer.id);
            return developer.id;
        } catch (error) {
            console.error('❌ Error inserting developer:', error.message);
            return null;
        }
    }

    // Insert or get platform
    async insertPlatform(platform) {
        if (!platform || this.processedPlatforms.has(platform.platform.id)) {
            return this.processedPlatforms.has(platform.platform.id) ? platform.platform.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO platforms (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [platform.platform.id, platform.platform.name, platform.platform.slug]
            );
            
            this.processedPlatforms.add(platform.platform.id);
            return platform.platform.id;
        } catch (error) {
            console.error('❌ Error inserting platform:', error.message);
            return null;
        }
    }

    // Insert or get genre
    async insertGenre(genre) {
        if (!genre || this.processedGenres.has(genre.id)) {
            return this.processedGenres.has(genre.id) ? genre.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO genres (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [genre.id, genre.name, genre.slug]
            );
            
            this.processedGenres.add(genre.id);
            return genre.id;
        } catch (error) {
            console.error('❌ Error inserting genre:', error.message);
            return null;
        }
    }

    // Insert or get tag
    async insertTag(tag) {
        if (!tag || this.processedTags.has(tag.id)) {
            return this.processedTags.has(tag.id) ? tag.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO tags (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [tag.id, tag.name, tag.slug]
            );
            
            this.processedTags.add(tag.id);
            return tag.id;
        } catch (error) {
            console.error('❌ Error inserting tag:', error.message);
            return null;
        }
    }

    // Insert or get store
    async insertStore(store) {
        if (!store || this.processedStores.has(store.store.id)) {
            return this.processedStores.has(store.store.id) ? store.store.id : null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO stores (rawg_id, name, slug) VALUES (?, ?, ?)`,
                [store.store.id, store.store.name, store.store.slug]
            );
            
            this.processedStores.add(store.store.id);
            return store.store.id;
        } catch (error) {
            console.error('❌ Error inserting store:', error.message);
            return null;
        }
    }

    // Insert game
    async insertGame(gameData) {
        if (this.processedGames.has(gameData.id)) {
            return null;
        }

        try {
            const [result] = await this.connection.execute(
                `INSERT IGNORE INTO games (
                    rawg_id, name, slug, description, released, background_image, 
                    rating, metacritic_score, playtime, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    gameData.id,
                    gameData.name,
                    gameData.slug,
                    gameData.description_raw || gameData.description || '',
                    gameData.released || null,
                    gameData.background_image || '',
                    gameData.rating || 0,
                    gameData.metacritic || null,
                    gameData.playtime || 0
                ]
            );

            if (result.affectedRows > 0) {
                this.processedGames.add(gameData.id);
                return result.insertId;
            }
            return null;
        } catch (error) {
            console.error('❌ Error inserting game:', error.message);
            return null;
        }
    }

    // Insert game screenshots
    async insertGameScreenshots(gameDbId, rawgGameId, screenshots) {
        for (const screenshot of screenshots) {
            try {
                await this.connection.execute(
                    `INSERT IGNORE INTO game_screenshots (game_id, rawg_id, image_url) VALUES (?, ?, ?)`,
                    [gameDbId, screenshot.id, screenshot.image]
                );
            } catch (error) {
                console.error('❌ Error inserting screenshot:', error.message);
            }
        }
    }

    // Create junction table relationships
    async createGameRelationships(gameDbId, rawgGameId, gameData) {
        // Publishers
        if (gameData.publishers) {
            for (const publisher of gameData.publishers) {
                const publisherId = await this.insertPublisher(publisher);
                if (publisherId) {
                    try {
                        const [publisherDbResult] = await this.connection.execute(
                            `SELECT id FROM publishers WHERE rawg_id = ?`,
                            [publisherId]
                        );
                        if (publisherDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_publishers (game_id, publisher_id) VALUES (?, ?)`,
                                [gameDbId, publisherDbResult[0].id]
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking publisher:', error.message);
                    }
                }
            }
        }

        // Developers
        if (gameData.developers) {
            for (const developer of gameData.developers) {
                const developerId = await this.insertDeveloper(developer);
                if (developerId) {
                    try {
                        const [developerDbResult] = await this.connection.execute(
                            `SELECT id FROM developers WHERE rawg_id = ?`,
                            [developerId]
                        );
                        if (developerDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_developers (game_id, developer_id) VALUES (?, ?)`,
                                [gameDbId, developerDbResult[0].id]
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking developer:', error.message);
                    }
                }
            }
        }

        // Platforms
        if (gameData.platforms) {
            for (const platform of gameData.platforms) {
                const platformId = await this.insertPlatform(platform);
                if (platformId) {
                    try {
                        const [platformDbResult] = await this.connection.execute(
                            `SELECT id FROM platforms WHERE rawg_id = ?`,
                            [platformId]
                        );
                        if (platformDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_platforms (game_id, platform_id) VALUES (?, ?)`,
                                [gameDbId, platformDbResult[0].id]
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking platform:', error.message);
                    }
                }
            }
        }

        // Genres
        if (gameData.genres) {
            for (const genre of gameData.genres) {
                const genreId = await this.insertGenre(genre);
                if (genreId) {
                    try {
                        const [genreDbResult] = await this.connection.execute(
                            `SELECT id FROM genres WHERE rawg_id = ?`,
                            [genreId]
                        );
                        if (genreDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_genres (game_id, genre_id) VALUES (?, ?)`,
                                [gameDbId, genreDbResult[0].id]
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking genre:', error.message);
                    }
                }
            }
        }

        // Tags
        if (gameData.tags) {
            for (const tag of gameData.tags) {
                const tagId = await this.insertTag(tag);
                if (tagId) {
                    try {
                        const [tagDbResult] = await this.connection.execute(
                            `SELECT id FROM tags WHERE rawg_id = ?`,
                            [tagId]
                        );
                        if (tagDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_tags (game_id, tag_id) VALUES (?, ?)`,
                                [gameDbId, tagDbResult[0].id]
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking tag:', error.message);
                    }
                }
            }
        }

        // Stores
        if (gameData.stores) {
            for (const store of gameData.stores) {
                const storeId = await this.insertStore(store);
                if (storeId) {
                    try {
                        const [storeDbResult] = await this.connection.execute(
                            `SELECT id FROM stores WHERE rawg_id = ?`,
                            [storeId]
                        );
                        if (storeDbResult.length > 0) {
                            await this.connection.execute(
                                `INSERT IGNORE INTO game_stores (game_id, store_id, store_url) VALUES (?, ?, ?)`,
                                [gameDbId, storeDbResult[0].id, store.url || '']
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error linking store:', error.message);
                    }
                }
            }
        }
    }

    // Process a single game with full details
    async processGame(gameBasicData) {
        try {
            console.log(`🎮 Processing game: ${gameBasicData.name}`);

            // Get detailed game information
            const gameDetails = await this.fetchGameDetails(gameBasicData.id);
            if (!gameDetails) {
                console.log(`⚠️ Skipping game ${gameBasicData.name} - could not fetch details`);
                return;
            }

            // Insert the game
            const gameDbId = await this.insertGame(gameDetails);
            if (!gameDbId) {
                console.log(`⚠️ Game ${gameBasicData.name} already exists or failed to insert`);
                return;
            }

            // Get the actual database ID
            const [gameResult] = await this.connection.execute(
                `SELECT id FROM games WHERE rawg_id = ?`,
                [gameDetails.id]
            );

            if (gameResult.length === 0) {
                console.log(`⚠️ Could not find inserted game ${gameBasicData.name}`);
                return;
            }

            const actualGameDbId = gameResult[0].id;

            // Create all relationships
            await this.createGameRelationships(actualGameDbId, gameDetails.id, gameDetails);

            // Fetch and insert screenshots
            const screenshots = await this.fetchGameScreenshots(gameDetails.id);
            if (screenshots.length > 0) {
                await this.insertGameScreenshots(actualGameDbId, gameDetails.id, screenshots);
            }

            console.log(`✅ Successfully processed game: ${gameBasicData.name}`);
            
            // Add delay to respect rate limits
            await this.delay(DELAY_BETWEEN_REQUESTS);

        } catch (error) {
            console.error(`❌ Error processing game ${gameBasicData.name}:`, error.message);
        }
    }

    // Main seeding function
    async seedGames(startPage = 1, maxPages = 5) {
        try {
            console.log('🚀 Starting game seeding process...');
            console.log(`📊 Will process ${maxPages} pages starting from page ${startPage}`);

            for (let page = startPage; page < startPage + maxPages; page++) {
                console.log(`\n📄 Processing page ${page}...`);

                const gamesData = await this.fetchGamesFromRAWG(page);
                if (!gamesData || !gamesData.results) {
                    console.log(`⚠️ No games found on page ${page}`);
                    continue;
                }

                for (const game of gamesData.results) {
                    await this.processGame(game);
                }
            }

            console.log('✅ Game seeding completed!');
        } catch (error) {
            console.error('❌ Error during seeding process:', error.message);
        }
    }
}

// Main execution function
async function main() {
    if (!RAWG_API_KEY) {
        console.error('❌ RAWG_API_KEY environment variable is required');
        console.log('💡 Get your API key from: https://rawg.io/apidocs');
        process.exit(1);
    }

    const seeder = new GameSeeder();

    try {
        await seeder.connect();
        
        // Seed games (adjust maxPages as needed - each page has ~40 games)
        // Start with 3 pages (120 games) for testing, increase for production
        await seeder.seedGames(startPage, pagesToSeed);
        
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    } finally {
        await seeder.disconnect();
    }
}

// Export for use as module
module.exports = GameSeeder;

// Run if called directly
if (require.main === module) {
    main();
}