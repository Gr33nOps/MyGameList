CREATE USER 'zain'@'localhost' IDENTIFIED BY 'nian';
GRANT ALL PRIVILEGES ON gaming_community.* TO 'zain'@'localhost';
FLUSH PRIVILEGES;

CREATE DATABASE gaming_community;
USE gaming_community;

SHOW DATABASES;

USE gaming_community;

-- Create USER table
CREATE TABLE USER (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255),
    bio TEXT,
    join_date DATE DEFAULT (CURRENT_DATE),
    privacy_setting TINYINT(1) DEFAULT 0,
    last_login DATETIME
);

-- Create GAME table
CREATE TABLE GAME (
    game_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    developer VARCHAR(255),
    release_year INT,
    cover_art_url VARCHAR(255),
    description TEXT,
    avg_rating FLOAT,
    rating_count INT DEFAULT 0
);

-- Create PLATFORM table
CREATE TABLE PLATFORM (
    platform_id INT PRIMARY KEY AUTO_INCREMENT,
    platform_name VARCHAR(50) NOT NULL
);

-- Create GENRE table
CREATE TABLE GENRE (
    genre_id INT PRIMARY KEY AUTO_INCREMENT,
    genre_name VARCHAR(50) NOT NULL
);

-- Create USER_GAME_LIST table
CREATE TABLE USER_GAME_LIST (
    list_entry_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    game_id INT NOT NULL,
    status ENUM('playing', 'completed', 'dropped', 'plan_to_play') NOT NULL,
    score INT,
    review TEXT,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    hours_played INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES GAME(game_id) ON DELETE CASCADE,
    CONSTRAINT chk_score CHECK (score >= 0 AND score <= 10),
    CONSTRAINT chk_hours_played CHECK (hours_played >= 0)
);

-- Create CUSTOM_LIST table
CREATE TABLE CUSTOM_LIST (
    custom_list_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    list_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);

-- Create CUSTOM_LIST_ENTRY table
CREATE TABLE CUSTOM_LIST_ENTRY (
    entry_id INT PRIMARY KEY AUTO_INCREMENT,
    custom_list_id INT NOT NULL,
    game_id INT NOT NULL,
    position INT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custom_list_id) REFERENCES CUSTOM_LIST(custom_list_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES GAME(game_id) ON DELETE CASCADE,
    CONSTRAINT chk_position CHECK (position >= 0)
);

-- Create FRIENDSHIP table
CREATE TABLE FRIENDSHIP (
    friendship_id INT PRIMARY KEY AUTO_INCREMENT,
    requester_id INT NOT NULL,
    addressee_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES USER(user_id) ON DELETE CASCADE,
    FOREIGN KEY (addressee_id) REFERENCES USER(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_no_self_friendship CHECK (requester_id != addressee_id)
);

-- Create ACTIVITY table
CREATE TABLE ACTIVITY (
    activity_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    activity_type ENUM('list_update', 'review', 'comment', 'friendship') NOT NULL,
    reference_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);

-- Create COMMENT table
CREATE TABLE COMMENT (
    comment_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    game_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    parent_comment_id INT,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES GAME(game_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES COMMENT(comment_id) ON DELETE SET NULL
);

-- Create GAME_PLATFORM junction table
CREATE TABLE GAME_PLATFORM (
    game_id INT NOT NULL,
    platform_id INT NOT NULL,
    PRIMARY KEY (game_id, platform_id),
    FOREIGN KEY (game_id) REFERENCES GAME(game_id) ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES PLATFORM(platform_id) ON DELETE CASCADE
);

-- Create GAME_GENRE junction table
CREATE TABLE GAME_GENRE (
    game_id INT NOT NULL,
    genre_id INT NOT NULL,
    PRIMARY KEY (game_id, genre_id),
    FOREIGN KEY (game_id) REFERENCES GAME(game_id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES GENRE(genre_id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS
    GAME_GENRE,
    GAME_PLATFORM,
    COMMENT,
    ACTIVITY,
    FRIENDSHIP,
    CUSTOM_LIST_ENTRY,
    CUSTOM_LIST,
    USER_GAME_LIST,
    GENRE,
    PLATFORM,
    GAME,
    USER;
    
SHOW TABLES;