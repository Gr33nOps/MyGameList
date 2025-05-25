-- =============================================
-- CORE ENTITIES
-- =============================================

-- Users table
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email)
);

-- Publishers
CREATE TABLE publishers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- Developers
CREATE TABLE developers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- Platforms
CREATE TABLE platforms (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- Genres
CREATE TABLE genres (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- Tags
CREATE TABLE tags (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- Stores
CREATE TABLE stores (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    INDEX idx_name (name),
    INDEX idx_rawg_id (rawg_id)
);

-- =============================================
-- GAMES - MAIN ENTITY
-- =============================================

CREATE TABLE games (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rawg_id INT UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    released DATE,
    background_image VARCHAR(500),
    rating DECIMAL(3,2) DEFAULT 0.00,
    metacritic_score INT,
    playtime INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_slug (slug),
    INDEX idx_released (released),
    INDEX idx_rating (rating),
    INDEX idx_rawg_id (rawg_id)
);

-- =============================================
-- RELATIONSHIP TABLES
-- =============================================

-- Games to Publishers
CREATE TABLE game_publishers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    publisher_id BIGINT NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_publisher (game_id, publisher_id)
);

-- Games to Developers
CREATE TABLE game_developers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    developer_id BIGINT NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_developer (game_id, developer_id)
);

-- Games to Platforms
CREATE TABLE game_platforms (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    platform_id BIGINT NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_platform (game_id, platform_id)
);

-- Games to Genres
CREATE TABLE game_genres (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    genre_id BIGINT NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_genre (game_id, genre_id)
);

-- Games to Tags
CREATE TABLE game_tags (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_tag (game_id, tag_id)
);

-- Games to Stores
CREATE TABLE game_stores (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    store_url VARCHAR(500),
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE KEY unique_game_store (game_id, store_id)
);

-- =============================================
-- USER GAME INTERACTIONS
-- =============================================

-- User's game library
CREATE TABLE user_game_lists (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    game_id BIGINT NOT NULL,
    status ENUM('playing', 'completed', 'on_hold', 'dropped', 'plan_to_play') NOT NULL,
    score DECIMAL(3,1) CHECK (score >= 1.0 AND score <= 10.0),
    progress_hours DECIMAL(8,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_game (user_id, game_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- User game reviews
CREATE TABLE user_reviews (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    game_id BIGINT NOT NULL,
    title VARCHAR(255),
    content TEXT NOT NULL,
    score DECIMAL(3,1) CHECK (score >= 1.0 AND score <= 10.0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_game_review (user_id, game_id),
    INDEX idx_user_id (user_id),
    INDEX idx_game_id (game_id)
);

-- =============================================
-- SOCIAL FEATURES
-- =============================================

-- User follows
CREATE TABLE user_follows (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    follower_id BIGINT NOT NULL,
    following_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (follower_id, following_id)
);

-- User custom lists
CREATE TABLE user_lists (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Games in user lists
CREATE TABLE user_list_games (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    list_id BIGINT NOT NULL,
    game_id BIGINT NOT NULL,
    position INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE KEY unique_list_game (list_id, game_id)
);

-- =============================================
-- MEDIA
-- =============================================

-- Game screenshots
CREATE TABLE game_screenshots (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    game_id BIGINT NOT NULL,
    rawg_id INT UNIQUE,
    image_url VARCHAR(500) NOT NULL,
    
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
);