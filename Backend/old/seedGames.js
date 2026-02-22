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
        this.stats = {
            totalGames: 0,
            successfulInserts: 0,
            skippedGames: 0,
            failedGames: 0,
            duplicateGames: 0
        };
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

    // Fetch games from RAWG API with pagination - IMPROVED
    async fetchGamesFromRAWG(page = 1, pageSize = 40) {
        try {
            console.log(`📡 Fetching games from RAWG API - Page ${page}`);
            
            const response = await axios.get(`${RAWG_BASE_URL}/games`, {
                params: {
                    key: RAWG_API_KEY,
                    page: page,
                    page_size: pageSize,
                    ordering: '-rating,-metacritic' // Removed metacritic filter to get more games
                    // Removed metacritic: '70,100' - this was limiting results significantly
                },
                timeout: 10000 // 10 second timeout
            });
            
            console.log(`📊 Found ${response.data.results?.length || 0} games on page ${page}`);
            console.log(`📈 Total games available: ${response.data.count}`);
            
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching games from page ${page}:`, error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Response: ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }

    // Fetch detailed game information with better error handling
    async fetchGameDetails(gameId) {
        try {
            const response = await axios.get(`${RAWG_BASE_URL}/games/${gameId}`, {
                params: {
                    key: RAWG_API_KEY
                },
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching game details for ID ${gameId}:`, error.message);
            if (error.response?.status === 404) {
                console.log(`   Game ${gameId} not found (404)`);
            }
            return null;
        }
    }

    // Fetch game screenshots with better error handling
    async fetchGameScreenshots(gameId) {
        try {
            const response = await axios.get(`${RAWG_BASE_URL}/games/${gameId}/screenshots`, {
                params: {
                    key: RAWG_API_KEY
                },
                timeout: 10000
            });
            return response.data.results || [];
        } catch (error) {
            console.error(`❌ Error fetching screenshots for game ID ${gameId}:`, error.message);
            return [];
        }
    }

    // Check if game already exists - IMPROVED
    async gameExists(rawgId) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id FROM games WHERE rawg_id = ?`,
                [rawgId]
            );
            return rows.length > 0;
        } catch (error) {
            console.error('❌ Error checking game existence:', error.message);
            return false;
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

    // Insert game with better error handling and logging
    async insertGame(gameData) {
        if (this.processedGames.has(gameData.id)) {
            this.stats.duplicateGames++;
            return null;
        }

        // Check if game already exists in database
        if (await this.gameExists(gameData.id)) {
            console.log(`⚠️ Game ${gameData.name} already exists in database`);
            this.stats.duplicateGames++;
            this.processedGames.add(gameData.id);
            return null;
        }

        try {
            console.log(`💾 Inserting game: ${gameData.name} (ID: ${gameData.id})`);
            
            const [result] = await this.connection.execute(
                `INSERT INTO games (
                    rawg_id, name, slug, description, released, background_image, 
                    rating, metacritic_score, playtime, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    gameData.id,
                    gameData.name || 'Unknown',
                    gameData.slug || '',
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
                this.stats.successfulInserts++;
                console.log(`✅ Successfully inserted game: ${gameData.name}`);
                return result.insertId;
            }
            return null;
        } catch (error) {
            console.error(`❌ Error inserting game ${gameData.name}:`, error.message);
            this.stats.failedGames++;
            return null;
        }
    }

    // Insert game screenshots
    async insertGameScreenshots(gameDbId, rawgGameId, screenshots) {
        if (!screenshots || screenshots.length === 0) return;
        
        console.log(`📸 Inserting ${screenshots.length} screenshots for game ID ${rawgGameId}`);
        
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

    // Create junction table relationships with better error handling
    async createGameRelationships(gameDbId, rawgGameId, gameData) {
        console.log(`🔗 Creating relationships for game ID ${rawgGameId}`);
        
        // Publishers
        if (gameData.publishers && gameData.publishers.length > 0) {
            console.log(`   📚 Processing ${gameData.publishers.length} publishers`);
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
        if (gameData.developers && gameData.developers.length > 0) {
            console.log(`   👨‍💻 Processing ${gameData.developers.length} developers`);
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
        if (gameData.platforms && gameData.platforms.length > 0) {
            console.log(`   🎮 Processing ${gameData.platforms.length} platforms`);
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
        if (gameData.genres && gameData.genres.length > 0) {
            console.log(`   🎯 Processing ${gameData.genres.length} genres`);
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
        if (gameData.tags && gameData.tags.length > 0) {
            console.log(`   🏷️ Processing ${gameData.tags.length} tags`);
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
        if (gameData.stores && gameData.stores.length > 0) {
            console.log(`   🏪 Processing ${gameData.stores.length} stores`);
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

    // Process a single game with full details - IMPROVED
    async processGame(gameBasicData) {
        this.stats.totalGames++;
        
        try {
            console.log(`\n🎮 Processing game ${this.stats.totalGames}: ${gameBasicData.name} (ID: ${gameBasicData.id})`);

            // Check if already processed
            if (this.processedGames.has(gameBasicData.id)) {
                console.log(`⚠️ Game ${gameBasicData.name} already processed in this session`);
                this.stats.skippedGames++;
                return;
            }

            // Get detailed game information
            const gameDetails = await this.fetchGameDetails(gameBasicData.id);
            if (!gameDetails) {
                console.log(`⚠️ Skipping game ${gameBasicData.name} - could not fetch details`);
                this.stats.skippedGames++;
                return;
            }

            // Insert the game
            const gameDbId = await this.insertGame(gameDetails);
            if (!gameDbId) {
                console.log(`⚠️ Game ${gameBasicData.name} was not inserted (may already exist)`);
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
            this.stats.failedGames++;
        }
    }

    // Print statistics
    printStats() {
        console.log('\n📊 SEEDING STATISTICS:');
        console.log(`   Total games processed: ${this.stats.totalGames}`);
        console.log(`   Successful insertions: ${this.stats.successfulInserts}`);
        console.log(`   Duplicate/existing games: ${this.stats.duplicateGames}`);
        console.log(`   Skipped games: ${this.stats.skippedGames}`);
        console.log(`   Failed games: ${this.stats.failedGames}`);
        console.log(`   Success rate: ${((this.stats.successfulInserts / this.stats.totalGames) * 100).toFixed(2)}%`);
    }

    // Get current database count
    async getDatabaseCount() {
        try {
            const [result] = await this.connection.execute('SELECT COUNT(*) as count FROM games');
            return result[0].count;
        } catch (error) {
            console.error('Error getting database count:', error.message);
            return 0;
        }
    }

    // Main seeding function with better logging and error handling
    async seedGames(startPage = 1, maxPages = 5) {
        try {
            console.log('🚀 Starting game seeding process...');
            console.log(`📊 Will process ${maxPages} pages starting from page ${startPage}`);
            
            const initialCount = await this.getDatabaseCount();
            console.log(`📈 Current games in database: ${initialCount}`);

            for (let page = startPage; page < startPage + maxPages; page++) {
                console.log(`\n📄 Processing page ${page}/${startPage + maxPages - 1}...`);

                const gamesData = await this.fetchGamesFromRAWG(page);
                if (!gamesData || !gamesData.results || gamesData.results.length === 0) {
                    console.log(`⚠️ No games found on page ${page}`);
                    continue;
                }

                console.log(`📊 Processing ${gamesData.results.length} games from page ${page}`);

                for (let i = 0; i < gamesData.results.length; i++) {
                    const game = gamesData.results[i];
                    console.log(`\n[${i + 1}/${gamesData.results.length}] Processing: ${game.name}`);
                    await this.processGame(game);
                }

                // Show progress after each page
                this.printStats();
            }

            const finalCount = await this.getDatabaseCount();
            console.log(`\n📈 Final games in database: ${finalCount}`);
            console.log(`📊 Games added this session: ${finalCount - initialCount}`);
            
            console.log('\n✅ Game seeding completed!');
            this.printStats();
            
        } catch (error) {
            console.error('❌ Error during seeding process:', error.message);
            this.printStats();
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
        
        // Seed games
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