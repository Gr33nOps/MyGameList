const API_BASE = '/api';

let authToken   = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));
let allGames    = [];
let currentFilters   = {};
let currentSort      = 'release';
let currentSortOrder = 'desc';
let currentPage    = 1;
let gamesPerPage   = 20;
let apiGamesPerPage = 100;
let isLoading    = false;
let hasMoreGames = true;
let retryCount   = 0;
const maxRetries = 3;
let isVerifying  = false;

let userCustomLists = [];

let allFilterOptions = {
    genres:     new Set(),
    platforms:  new Set(),
    publishers: new Set(),
    developers: new Set()
};

const EDITION_KEYWORDS = [
    'game of the year', 'goty', 'definitive edition', 'enhanced edition',
    'complete edition', 'deluxe edition', 'gold edition', 'platinum edition',
    'ultimate edition', 'premium edition', "collector's edition", 'collectors edition',
    'remastered', "director's cut", 'directors cut', 'special edition',
    'extended edition', 'anniversary edition', 'legacy edition', 'royal edition',
    'master chief collection', '- bundle', ': bundle', 'bundle edition',
    'expanded edition', 'full edition', 'digital deluxe', 'digital premium'
];

function isEditionVariant(name) {
    if (!name) return false;
    var lower = name.toLowerCase();
    return EDITION_KEYWORDS.some(function(kw) { return lower.includes(kw); });
}

if (!authToken) {
    window.location.href = 'auth.html';
} else {
    verifyToken();
}

async function verifyToken() {
    if (isVerifying) return;
    isVerifying = true;

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));

            const modifyLink = document.getElementById('modifyLink');
            const manageLink = document.getElementById('manageLink');

            if (data.user.is_admin) {
                if (manageLink) manageLink.style.display = 'inline-block';
            } else if (data.user.is_moderator) {
                if (modifyLink) modifyLink.style.display = 'inline-block';
            }

            isVerifying = false;
            initPage();
        } else {
            isVerifying = false;
            if (response.status === 401 || response.status === 403) {
                logout();
            } else {
                showConnectionError();
            }
        }
    } catch (error) {
        console.error('Network error during token verification:', error);
        isVerifying = false;
        showConnectionError();
    }
}

function showConnectionError() {
    var container = document.querySelector('.container');
    if (container) {
        container.innerHTML =
            '<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column;gap:20px;padding:20px;">' +
                '<h2 style="color:#ff6b6b;">Connection Error</h2>' +
                '<p style="color:#fff;text-align:center;">Unable to connect to the server. Please make sure the backend is running.</p>' +
                '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                    '<button onclick="location.reload()" class="btn btn-primary">Retry</button>' +
                    '<button onclick="logout()" class="btn btn-danger">Logout</button>' +
                '</div>' +
            '</div>';
    }
}

function initPage() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('searchBtn').addEventListener('click', searchGames);
    document.getElementById('filterBtn').addEventListener('click', toggleFilterSection);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    var searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchGames();
    });

    var sortBySelect = document.getElementById('sortBy');
    sortBySelect.value = 'release-desc';
    sortBySelect.addEventListener('change', function() {
        var value = sortBySelect.value;

        if (value === 'coming-soon') {
            currentSort      = 'coming';
            currentSortOrder = 'soon';
        } else {
            var dashIdx      = value.lastIndexOf('-');
            currentSort      = value.substring(0, dashIdx);
            currentSortOrder = value.substring(dashIdx + 1);
        }

        currentPage  = 1;
        allGames     = [];
        hasMoreGames = true;
        retryCount   = 0;
        window.scrollTo(0, 0);
        fetchGames(true);
    });

    document.getElementById('prevPageBtn').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPageBtn').addEventListener('click', goToNextPage);

    document.getElementById('gameModal').addEventListener('click', function(e) {
        if (e.target.id === 'gameModal') closeModal();
    });

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('game-card')) {
            showGameDetails(e.target.dataset.gameId);
        } else if (e.target.closest('.game-card')) {
            var gameCard = e.target.closest('.game-card');
            if (!e.target.classList.contains('btn')) {
                showGameDetails(gameCard.dataset.gameId);
            }
        } else if (e.target.classList.contains('add-to-list-btn')) {
            var gameId   = e.target.dataset.gameId;
            var gameData = e.target.dataset.gameData;
            addToList(gameId, gameData ? JSON.parse(gameData) : null);
        }
    });

    loadIGDBFilters();
    loadUserCustomLists();
    fetchGames(true);
}

async function loadUserCustomLists() {
    try {
        var r = await fetch(`${API_BASE}/user/lists`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            var d = await r.json();
            userCustomLists = d.lists || [];
        }
    } catch (e) {
        console.error('Failed to load custom lists:', e);
    }
}

async function loadIGDBFilters() {
    try {
        var genresResponse = await fetch(`${API_BASE}/igdb/genres`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'fields name; limit 50; sort name asc;' })
        });
        if (genresResponse.ok) {
            var genres = await genresResponse.json();
            genres.forEach(function(genre) { allFilterOptions.genres.add(genre.name); });
        }

        var platformsResponse = await fetch(`${API_BASE}/igdb/platforms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'fields name; where category = (1,5,6); limit 100; sort name asc;' })
        });
        if (platformsResponse.ok) {
            var platforms = await platformsResponse.json();
            platforms.forEach(function(platform) { allFilterOptions.platforms.add(platform.name); });
        }

        populateFilterOptions();
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

async function fetchGames(replace) {
    if (replace === undefined) replace = true;
    if (isLoading || (!replace && !hasMoreGames)) return;
    isLoading = true;

    document.getElementById('loadingIndicator').style.display = 'flex';

    try {
        var offset           = (currentPage - 1) * apiGamesPerPage;
        var currentTimestamp = Math.floor(Date.now() / 1000);
        var isSearchMode     = !!(currentFilters.search && currentFilters.search.trim());
        var isComingSoon     = currentSort === 'coming' && currentSortOrder === 'soon';
        var isPopularity     = currentSort === 'popularity';

        var queryParts = [];
        queryParts.push('fields name, cover.url, rating, rating_count, summary, first_release_date, aggregated_rating, aggregated_rating_count, total_rating, total_rating_count, genres.name, platforms.name, involved_companies.company.name, involved_companies.publisher, involved_companies.developer;');
        queryParts.push('limit ' + apiGamesPerPage + ';');
        queryParts.push('offset ' + offset + ';');

        var whereClauses = [];
        whereClauses.push('version_parent = null');

        if (!isSearchMode) {
            whereClauses.push('cover != null');
        }

        if (isComingSoon) {
            whereClauses.push('first_release_date > ' + currentTimestamp);
        } else {
            whereClauses.push('first_release_date != null & first_release_date <= ' + currentTimestamp);
            if (isPopularity && !isSearchMode) {
                whereClauses.push('total_rating_count != null & total_rating_count >= 5');
            }
        }

        if (currentFilters.search)    whereClauses.push('name ~ *"' + currentFilters.search + '"*');
        if (currentFilters.genre)     whereClauses.push('genres.name = "' + currentFilters.genre + '"');
        if (currentFilters.platform)  whereClauses.push('platforms.name = "' + currentFilters.platform + '"');
        if (currentFilters.publisher) whereClauses.push('involved_companies.company.name = "' + currentFilters.publisher + '" & involved_companies.publisher = true');
        if (currentFilters.developer) whereClauses.push('involved_companies.company.name = "' + currentFilters.developer + '" & involved_companies.developer = true');

        if (whereClauses.length > 0) queryParts.push('where ' + whereClauses.join(' & ') + ';');

        var sortField = 'first_release_date';
        var sortOrder = currentSortOrder;

        if (isComingSoon) {
            sortField = 'first_release_date';
            sortOrder = 'asc';
        } else if (isPopularity) {
            sortField = 'total_rating_count';
            sortOrder = 'desc';
        } else {
            switch (currentSort) {
                case 'rating':  sortField = 'total_rating';       break;
                case 'name':    sortField = 'name';               break;
                case 'release': sortField = 'first_release_date'; break;
                default:        sortField = 'first_release_date'; break;
            }
        }

        queryParts.push('sort ' + sortField + ' ' + sortOrder + ';');

        var query = queryParts.join(' ');

        var response = await fetch(`${API_BASE}/igdb/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });

        var data = await response.json();

        if (response.ok) {
            retryCount = 0;

            var filteredData = data;
            if (!isComingSoon) {
                filteredData = data.filter(function(game) {
                    return game.first_release_date && game.first_release_date <= currentTimestamp;
                });
            } else {
                filteredData = data.filter(function(game) {
                    return game.first_release_date && game.first_release_date > currentTimestamp;
                });
            }

            var searchTermIsEdition = isSearchMode &&
                EDITION_KEYWORDS.some(function(kw) { return currentFilters.search.toLowerCase().includes(kw); });

            if (!searchTermIsEdition) {
                filteredData = filteredData.filter(function(game) { return !isEditionVariant(game.name); });
            }

            var transformedGames = filteredData.map(function(game) {
                var publishers = [];
                var developers = [];
                if (game.involved_companies) {
                    game.involved_companies.forEach(function(ic) {
                        if (ic.company) {
                            if (ic.publisher) publishers.push({ name: ic.company.name });
                            if (ic.developer) developers.push({ name: ic.company.name });
                        }
                    });
                }

                var displayRating = null;
                var igdbScore     = null;
                if (game.total_rating && game.total_rating_count >= 5) {
                    displayRating = (game.total_rating / 20).toFixed(1);
                    igdbScore     = Math.round(game.total_rating);
                } else if (game.aggregated_rating && game.aggregated_rating_count >= 3) {
                    displayRating = (game.aggregated_rating / 20).toFixed(1);
                    igdbScore     = Math.round(game.aggregated_rating);
                }

                return {
                    id:               'igdb_' + game.id,
                    igdb_id:          game.id,
                    name:             game.name,
                    background_image: game.cover
                        ? 'https:' + game.cover.url.replace('t_thumb', 't_cover_big')
                        : null,
                    rating:           displayRating,
                    description:      game.summary || '',
                    released:         game.first_release_date
                        ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
                        : null,
                    metacritic_score: igdbScore,
                    rating_count:     game.total_rating_count || game.rating_count || 0,
                    playtime:         0,
                    genres:           game.genres    || [],
                    platforms:        game.platforms || [],
                    publishers:       publishers,
                    developers:       developers,
                    is_coming_soon:   game.first_release_date
                        ? game.first_release_date > currentTimestamp
                        : false
                };
            });

            allGames     = replace ? transformedGames : allGames.concat(transformedGames);
            hasMoreGames = data.length === apiGamesPerPage;

            collectFilterOptions(transformedGames);

            var gamesToDisplay = transformedGames.slice(0, gamesPerPage);
            displaySearchResults(gamesToDisplay, replace);
            updatePaginationButtons();

            if (gamesToDisplay.length === 0 && replace) {
                var message = currentFilters.search
                    ? 'No games found for "' + currentFilters.search + '".'
                    : isComingSoon ? 'No upcoming games found.' : 'No games found.';
                document.getElementById('searchResults').innerHTML =
                    '<div class="empty-state">' + message + '</div>';
            }
        } else if (response.status === 429 && retryCount < maxRetries) {
            retryCount++;
            await new Promise(function(resolve) { setTimeout(resolve, 2000 * retryCount); });
            return fetchGames(replace);
        } else {
            document.getElementById('searchResults').innerHTML =
                '<div class="empty-state">Error loading games. Please try again.</div>';
        }
    } catch (error) {
        console.error('Fetch error:', error);
        if (retryCount < maxRetries) {
            retryCount++;
            await new Promise(function(resolve) { setTimeout(resolve, 2000 * retryCount); });
            return fetchGames(replace);
        }
        document.getElementById('searchResults').innerHTML =
            '<div class="empty-state">Error loading games. Please try again.</div>';
    } finally {
        isLoading = false;
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function collectFilterOptions(games) {
    games.forEach(function(game) {
        if (game.genres)     game.genres.forEach(function(g) { allFilterOptions.genres.add(g.name); });
        if (game.platforms)  game.platforms.forEach(function(p) { allFilterOptions.platforms.add(p.name); });
        if (game.publishers) game.publishers.forEach(function(p) { allFilterOptions.publishers.add(p.name); });
        if (game.developers) game.developers.forEach(function(d) { allFilterOptions.developers.add(d.name); });
    });
    populateFilterOptions();
}

function getRatingColor(score) {
    if (!score)    return '#666';
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
}

function displaySearchResults(games, replace) {
    if (replace === undefined) replace = true;
    var container = document.getElementById('searchResults');

    if (games.length === 0 && replace) {
        container.innerHTML = '<div class="empty-state">No games found.</div>';
        return;
    }

    var currentTimestamp = Math.floor(Date.now() / 1000);

    var html = games.map(function(game) {
        var gameReleaseTs = game.released ? new Date(game.released).getTime() / 1000 : 0;
        var isComingSoon  = gameReleaseTs > currentTimestamp;
        var imgSrc        = game.background_image || 'https://via.placeholder.com/300x400?text=No+Image';

        var releasedHtml = '';
        if (game.released) {
            var dateColor = isComingSoon ? '#3b82f6' : '#94a3b8';
            var dateStr   = new Date(game.released).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            releasedHtml  = '<span style="color:' + dateColor + ';font-size:12px;">' + dateStr + '</span>';
        }

        var genresHtml = (game.genres || []).slice(0, 3).map(function(g) {
            return '<span class="genre-tag">' + g.name + '</span>';
        }).join('');

        var descHtml = '';
        if (game.description) {
            var short = game.description.substring(0, 90) + (game.description.length > 90 ? '...' : '');
            descHtml = '<p style="color:#94a3b8;font-size:12px;margin-top:8px;line-height:1.5;">' + short + '</p>';
        }

        return '<div class="game-card" data-game-id="' + game.id + '">' +
            '<div class="game-image-wrapper">' +
                '<img src="' + imgSrc + '" alt="' + game.name + '" class="game-image" loading="lazy" onerror="this.src=\'https://via.placeholder.com/300x400?text=No+Image\'">' +
            '</div>' +
            '<div class="game-info">' +
                '<div class="game-title">' + game.name + '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap;">' + releasedHtml + '</div>' +
                '<div class="game-genres">' + genresHtml + '</div>' +
                descHtml +
            '</div>' +
        '</div>';
    }).join('');

    if (replace) {
        container.innerHTML = html;
    } else {
        container.insertAdjacentHTML('beforeend', html);
    }
}

async function showGameDetails(gameId) {
    try {
        var game;

        if (gameId.startsWith('igdb_')) {
            var igdbId = gameId.replace('igdb_', '');

            var response = await fetch(`${API_BASE}/igdb/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: 'fields name, cover.url, rating, summary, first_release_date, aggregated_rating, aggregated_rating_count, total_rating, total_rating_count, rating_count, genres.name, platforms.name, involved_companies.company.name, involved_companies.publisher, involved_companies.developer, screenshots.url; where id = ' + igdbId + ';'
                })
            });

            var igdbGames = await response.json();

            if (response.ok && igdbGames.length > 0) {
                var igdbGame   = igdbGames[0];
                var publishers = [];
                var developers = [];

                if (igdbGame.involved_companies) {
                    igdbGame.involved_companies.forEach(function(ic) {
                        if (ic.company) {
                            if (ic.publisher) publishers.push({ name: ic.company.name });
                            if (ic.developer) developers.push({ name: ic.company.name });
                        }
                    });
                }

                var displayRating = null;
                var igdbScore     = null;
                if (igdbGame.total_rating && igdbGame.total_rating_count >= 5) {
                    displayRating = (igdbGame.total_rating / 20).toFixed(1);
                    igdbScore     = Math.round(igdbGame.total_rating);
                } else if (igdbGame.aggregated_rating && igdbGame.aggregated_rating_count >= 3) {
                    displayRating = (igdbGame.aggregated_rating / 20).toFixed(1);
                    igdbScore     = Math.round(igdbGame.aggregated_rating);
                }

                game = {
                    id:               gameId,
                    igdb_id:          igdbGame.id,
                    name:             igdbGame.name,
                    background_image: igdbGame.cover
                        ? 'https:' + igdbGame.cover.url.replace('t_thumb', 't_cover_big')
                        : null,
                    screenshot_image: igdbGame.cover
                        ? 'https:' + igdbGame.cover.url.replace('t_thumb', 't_screenshot_big')
                        : null,
                    rating:           displayRating,
                    description:      igdbGame.summary || 'No description available',
                    released:         igdbGame.first_release_date
                        ? new Date(igdbGame.first_release_date * 1000).toISOString().split('T')[0]
                        : null,
                    metacritic_score: igdbScore,
                    rating_count:     igdbGame.total_rating_count || igdbGame.rating_count || 0,
                    playtime:         0,
                    genres:           igdbGame.genres    || [],
                    platforms:        igdbGame.platforms || [],
                    publishers:       publishers,
                    developers:       developers
                };
            }
        } else {
            var resp = await fetch(`${API_BASE}/games/${gameId}`);
            game = await resp.json();
        }

        if (game) {
            var gameDataStr = JSON.stringify({
                igdb_id:          game.igdb_id,
                name:             game.name,
                background_image: game.background_image,
                rating:           game.rating,
                description:      game.description,
                released:         game.released,
                metacritic_score: game.metacritic_score,
                playtime:         game.playtime,
                genres:           game.genres,
                platforms:        game.platforms,
                publishers:       game.publishers,
                developers:       game.developers
            }).replace(/"/g, '&quot;');

            var heroBg   = game.screenshot_image || game.background_image || 'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image';
            var coverSrc = game.background_image || heroBg;

            var infoItems = [
                game.released
                    ? { label: 'Released', value: new Date(game.released).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
                    : null,
                game.publishers && game.publishers.length
                    ? { label: 'Publisher', value: game.publishers.map(function(p) { return p.name; }).join(', ') }
                    : null,
                game.developers && game.developers.length
                    ? { label: 'Developer', value: game.developers.map(function(d) { return d.name; }).join(', ') }
                    : null,
                game.platforms && game.platforms.length
                    ? { label: 'Platforms', value: game.platforms.map(function(p) { return p.name; }).join(' · ') }
                    : null
            ].filter(Boolean);

            var customListOptions = userCustomLists.length > 0
                ? userCustomLists.map(function(list) {
                    return '<option value="custom_' + list.id + '">' + list.name + '</option>';
                }).join('')
                : '';

            var genreTagsHtml = '';
            if (game.genres && game.genres.length) {
                genreTagsHtml = '<div class="game-detail-genres">' +
                    game.genres.map(function(g) { return '<span class="game-detail-genre-tag">' + g.name + '</span>'; }).join('') +
                '</div>';
            }

            var infoGridHtml = '';
            if (infoItems.length) {
                infoGridHtml = '<div class="game-detail-info-grid">' +
                    infoItems.map(function(item) {
                        return '<div class="game-detail-info-item"><div class="game-detail-info-label">' + item.label + '</div><div class="game-detail-info-value">' + item.value + '</div></div>';
                    }).join('') +
                '</div>';
            }

            var releasedBadge = game.released
                ? '<span class="game-detail-date">' + new Date(game.released).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + '</span>'
                : '';

            var descHtml = game.description
                ? '<p class="game-detail-desc">' + game.description + '</p>'
                : '';

            document.getElementById('gameDetails').innerHTML =
                '<div class="game-detail-hero">' +
                    '<img src="' + heroBg + '" alt="' + game.name + ' banner" class="game-detail-hero-img" loading="lazy" onerror="this.src=\'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image\'">' +
                '</div>' +
                '<div class="game-detail-body">' +
                    '<div class="game-detail-title-row">' +
                        '<img src="' + coverSrc + '" alt="' + game.name + ' cover" class="game-detail-cover" loading="lazy" onerror="this.src=\'https://via.placeholder.com/100x134/1e293b/64748b?text=?\'">' +
                        '<div class="game-detail-title-meta">' +
                            '<div class="game-detail-title">' + game.name + '</div>' +
                            '<div class="game-detail-badges">' + releasedBadge + '</div>' +
                        '</div>' +
                    '</div>' +
                    genreTagsHtml +
                    infoGridHtml +
                    descHtml +
                    '<div class="add-to-list">' +
                        '<h3>Add to My List</h3>' +
                        '<div style="margin-bottom:12px;">' +
                            '<label style="display:block;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:6px;">Add to List</label>' +
                            '<select id="gameListSelect" class="filter-select" style="width:100%;margin:0;" onchange="handleListSelectChange()">' +
                                '<option value="default">My Game Collection (Default)</option>' +
                                customListOptions +
                            '</select>' +
                        '</div>' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">' +
                            '<div>' +
                                '<label style="display:block;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:6px;">Status</label>' +
                                '<select id="gameStatus" class="filter-select" style="width:100%;margin:0;">' +
                                    '<option value="playing">Playing</option>' +
                                    '<option value="completed" selected>Completed</option>' +
                                    '<option value="plan_to_play">Plan to Play</option>' +
                                    '<option value="on_hold">On Hold</option>' +
                                    '<option value="dropped">Dropped</option>' +
                                '</select>' +
                            '</div>' +
                            '<div>' +
                                '<label style="display:block;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:6px;">Your Score (1-10)</label>' +
                                '<div class="score-input-container" style="margin:0;">' +
                                    '<input type="number" id="gameScore" class="score-input" min="1" max="10" placeholder="--" style="width:100%;">' +
                                    '<div class="score-controls">' +
                                        '<div class="score-btn" id="scoreUpBtn">+</div>' +
                                        '<div class="score-btn" id="scoreDownBtn">-</div>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div id="customListNote" style="display:none;margin-bottom:12px;padding:10px 14px;background:var(--blue-dim);border:1px solid var(--blue-glow);border-radius:var(--radius-md);font-size:0.82rem;color:var(--blue-light);">' +
                            'The game will be added to your selected custom list with the status above.' +
                        '</div>' +
                        '<div style="display:flex;align-items:center;gap:12px;">' +
                            '<button class="btn btn-primary btn-sm add-to-list-btn" data-game-id="' + game.id + '" data-game-data="' + gameDataStr + '" style="flex-shrink:0;white-space:nowrap;">Add to List</button>' +
                            '<span id="addGameMessage" style="font-size:13px;font-weight:600;"></span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            document.getElementById('gameModal').style.display = 'flex';

            document.getElementById('scoreUpBtn').addEventListener('click', function() {
                var input = document.getElementById('gameScore');
                if (!input.value) input.value = 1;
                else if (parseInt(input.value) < 10) input.value = parseInt(input.value) + 1;
            });

            document.getElementById('scoreDownBtn').addEventListener('click', function() {
                var input = document.getElementById('gameScore');
                if (!input.value) input.value = 1;
                else if (parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
            });
        }
    } catch (error) {
        console.error('Show game details error:', error);
    }
}

function handleListSelectChange() {
    var select = document.getElementById('gameListSelect');
    var note   = document.getElementById('customListNote');
    if (select && note) {
        note.style.display = select.value !== 'default' ? 'block' : 'none';
    }
}

async function addToList(gameId, gameData) {
    var statusSelect = document.getElementById('gameStatus');
    var scoreInput   = document.getElementById('gameScore');
    var listSelect   = document.getElementById('gameListSelect');
    var messageEl    = document.getElementById('addGameMessage');
    var listValue    = listSelect   ? listSelect.value   : 'default';
    var status       = statusSelect ? statusSelect.value : 'plan_to_play';
    var score        = scoreInput   ? scoreInput.value   : '';

    if (score && (parseInt(score) < 1 || parseInt(score) > 10)) {
        showInlineMsg(messageEl, 'Score must be between 1 and 10.', 'error');
        scoreInput.focus();
        return;
    }

    if (listValue === 'default') {
        try {
            var r = await fetch(`${API_BASE}/user/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    game_id:   gameId,
                    game_data: gameData,
                    status:    status,
                    score:     score ? parseInt(score) : null
                })
            });
            var d = await r.json();
            if (!r.ok) {
                if (d.error === 'Game already in your list') {
                    showInlineMsg(messageEl, 'Already in your collection.', 'success');
                } else {
                    showInlineMsg(messageEl, d.error || 'Failed to add game.', 'error');
                }
                return;
            }
            showInlineMsg(messageEl, 'Game added to your collection.', 'success');
            if (scoreInput)   scoreInput.value   = '';
            if (statusSelect) statusSelect.value = 'completed';
        } catch (error) {
            console.error('Add to collection error:', error);
            showInlineMsg(messageEl, 'Network error. Please try again.', 'error');
        }

    } else {
        var listId = listValue.replace('custom_', '');

        try {
            var addResp = await fetch(`${API_BASE}/user/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    game_id:   gameId,
                    game_data: gameData,
                    status:    status,
                    score:     score ? parseInt(score) : null
                })
            });
            var addData = await addResp.json();
            var wasAlreadyInCollection = !addResp.ok && addData.error === 'Game already in your list';

            if (!addResp.ok && !wasAlreadyInCollection) {
                showInlineMsg(messageEl, addData.error || 'Failed to prepare game data.', 'error');
                return;
            }

            var gamesResp = await fetch(`${API_BASE}/user/games`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!gamesResp.ok) {
                showInlineMsg(messageEl, 'Failed to retrieve game data.', 'error');
                return;
            }
            var gamesData    = await gamesResp.json();
            var matchedGame  = gamesData.games.find(function(g) {
                return gameData ? g.name === gameData.name : g.game_id == gameId;
            });

            if (!matchedGame) {
                showInlineMsg(messageEl, 'Could not locate game in database.', 'error');
                return;
            }

            if (!wasAlreadyInCollection) {
                await fetch(`${API_BASE}/user/games/${matchedGame.game_id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
            }

            var listResp = await fetch(`${API_BASE}/user/lists/${listId}/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ game_id: matchedGame.game_id, status: status, score: score ? parseInt(score) : null })
            });
            var listData = await listResp.json();

            if (!listResp.ok) {
                if (listData.error === 'Game already in this list') {
                    showInlineMsg(messageEl, 'Already in that list.', 'success');
                } else {
                    showInlineMsg(messageEl, 'Failed to add to list: ' + listData.error, 'error');
                }
                return;
            }

            var matchedList = userCustomLists.find(function(l) { return l.id == listId; });
            var listName    = matchedList ? matchedList.name : 'list';
            showInlineMsg(messageEl, 'Game added to "' + listName + '".', 'success');
            if (scoreInput)   scoreInput.value   = '';
            if (statusSelect) statusSelect.value = 'completed';
            loadUserCustomLists();

        } catch (error) {
            console.error('Add to custom list error:', error);
            showInlineMsg(messageEl, 'Network error. Please try again.', 'error');
        }
    }
}

function showInlineMsg(el, text, type) {
    el.textContent = text;
    el.style.color = type === 'error' ? 'var(--red-light)' : 'var(--green-light)';
}

function populateFilterOptions() {
    var currentGenre     = document.getElementById('genre').value;
    var currentPlatform  = document.getElementById('platform').value;
    var currentPublisher = document.getElementById('publisher').value;
    var currentDeveloper = document.getElementById('developer').value;

    var genreSelect = document.getElementById('genre');
    genreSelect.innerHTML = '<option value="">All Genres</option>';
    Array.from(allFilterOptions.genres).sort().forEach(function(genre) {
        genreSelect.innerHTML += '<option value="' + genre + '"' + (currentGenre === genre ? ' selected' : '') + '>' + genre + '</option>';
    });

    var platformSelect = document.getElementById('platform');
    platformSelect.innerHTML = '<option value="">All Platforms</option>';
    Array.from(allFilterOptions.platforms).sort().forEach(function(plat) {
        platformSelect.innerHTML += '<option value="' + plat + '"' + (currentPlatform === plat ? ' selected' : '') + '>' + plat + '</option>';
    });

    var publisherSelect = document.getElementById('publisher');
    publisherSelect.innerHTML = '<option value="">All Publishers</option>';
    Array.from(allFilterOptions.publishers).sort().forEach(function(pub) {
        publisherSelect.innerHTML += '<option value="' + pub + '"' + (currentPublisher === pub ? ' selected' : '') + '>' + pub + '</option>';
    });

    var developerSelect = document.getElementById('developer');
    developerSelect.innerHTML = '<option value="">All Developers</option>';
    Array.from(allFilterOptions.developers).sort().forEach(function(dev) {
        developerSelect.innerHTML += '<option value="' + dev + '"' + (currentDeveloper === dev ? ' selected' : '') + '>' + dev + '</option>';
    });
}

function toggleFilterSection() {
    document.getElementById('filterSection').classList.toggle('hidden');
}

function applyFilters() {
    currentFilters = {
        genre:     document.getElementById('genre').value,
        platform:  document.getElementById('platform').value,
        publisher: document.getElementById('publisher').value,
        developer: document.getElementById('developer').value,
        search:    currentFilters.search || ''
    };
    currentPage  = 1;
    allGames     = [];
    hasMoreGames = true;
    retryCount   = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function resetFilters() {
    document.getElementById('genre').value       = '';
    document.getElementById('platform').value    = '';
    document.getElementById('publisher').value   = '';
    document.getElementById('developer').value   = '';
    document.getElementById('searchInput').value = '';
    currentFilters = {};
    currentPage    = 1;
    allGames       = [];
    hasMoreGames   = true;
    retryCount     = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function searchGames() {
    var searchTerm = document.getElementById('searchInput').value.trim();
    currentFilters.search = searchTerm;

    var sortBySelect = document.getElementById('sortBy');
    if (searchTerm) {
        sortBySelect.value = 'popularity-desc';
        currentSort      = 'popularity';
        currentSortOrder = 'desc';
    } else {
        sortBySelect.value = 'release-desc';
        currentSort      = 'release';
        currentSortOrder = 'desc';
    }

    currentPage  = 1;
    allGames     = [];
    hasMoreGames = true;
    retryCount   = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function goToPreviousPage() {
    if (currentPage <= 1 || isLoading) return;
    currentPage--;
    allGames     = [];
    hasMoreGames = true;
    retryCount   = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function goToNextPage() {
    if (!hasMoreGames || isLoading) return;
    currentPage++;
    allGames   = [];
    retryCount = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function updatePaginationButtons() {
    var prevPageBtn = document.getElementById('prevPageBtn');
    var nextPageBtn = document.getElementById('nextPageBtn');
    var pageInfo    = document.getElementById('pageInfo');

    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = !hasMoreGames;
    if (pageInfo)    pageInfo.textContent = 'Page ' + currentPage;
}

function closeModal() {
    document.getElementById('gameModal').style.display = 'none';
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'auth.html';
}

function showError(element, message) {
    element.innerHTML = '<div class="error">' + message + '</div>';
}

function showSuccess(element, message) {
    element.innerHTML = '<div class="success">' + message + '</div>';
}

window.logout                 = logout;
window.handleListSelectChange = handleListSelectChange;