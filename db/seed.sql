-- Insert sample users
INSERT INTO USER (username, email, password_hash, bio, profile_picture, join_date, privacy_setting)
VALUES
    ('Gamer123', 'gamer123@example.com', 'hashed_password_123', 'RPG enthusiast', 'https://via.placeholder.com/100', '2023-01-15', 0),
    ('PlayerOne', 'playerone@example.com', 'hashed_password_456', 'Loves action games', 'https://via.placeholder.com/100', '2023-02-01', 1);

-- Insert sample games
INSERT INTO GAME (title, developer, release_year, cover_art_url, description, avg_rating, rating_count)
VALUES
    ('The Witcher 3', 'CD Projekt Red', 2015, 'https://via.placeholder.com/150', 'Epic RPG adventure', 4.8, 1000),
    ('Elden Ring', 'FromSoftware', 2022, 'https://via.placeholder.com/150', 'Open-world action RPG', 4.7, 800);

-- Insert sample platforms
INSERT INTO PLATFORM (platform_name)
VALUES
    ('PC'),
    ('PlayStation 5');

-- Insert sample genres
INSERT INTO GENRE (genre_name)
VALUES
    ('RPG'),
    ('Action');

-- Insert sample user game lists
INSERT INTO USER_GAME_LIST (user_id, game_id, status, score, review, hours_played)
VALUES
    (1, 1, 'playing', 9, 'Amazing story!', 50),
    (1, 2, 'completed', 8, 'Challenging but fun', 120),
    (2, 1, 'plan_to_play', NULL, NULL, 0);

-- Insert sample custom list
INSERT INTO CUSTOM_LIST (user_id, list_name, description, is_public)
VALUES
    (1, 'Favorite RPGs', 'My top RPG games', 1);

-- Insert sample custom list entry
INSERT INTO CUSTOM_LIST_ENTRY (custom_list_id, game_id, position)
VALUES
    (1, 1, 1),
    (1, 2, 2);

-- Insert sample friendship
INSERT INTO FRIENDSHIP (requester_id, addressee_id, status)
VALUES
    (1, 2, 'pending');

-- Insert sample activity
INSERT INTO ACTIVITY (user_id, activity_type, reference_id, details)
VALUES
    (1, 'review', 1, 'Added a review for The Witcher 3'),
    (1, 'list_update', 1, 'Added Elden Ring to game list');

-- Insert sample comment
INSERT INTO COMMENT (user_id, game_id, content, parent_comment_id)
VALUES
    (1, 1, 'Love the open world in The Witcher 3!', NULL),
    (2, 1, 'Totally agree!', 1);

-- Insert sample game platforms
INSERT INTO GAME_PLATFORM (game_id, platform_id)
VALUES
    (1, 1),
    (1, 2),
    (2, 1);

-- Insert sample game genres
INSERT INTO GAME_GENRE (game_id, genre_id)
VALUES
    (1, 1),
    (2, 1),
    (2, 2);
    
SELECT * FROM USER;
SELECT * FROM GAME;