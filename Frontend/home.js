const API_BASE = '/api';

let authToken   = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));
let currentFilters   = {};
let currentSort      = 'trending';
let currentSortOrder = 'desc';
let currentPage    = 1;
let gamesPerPage   = 20;
let apiGamesPerPage = 40;
let isLoading    = false;
let hasMoreGames = true;
let retryCount   = 0;
const maxRetries = 3;
let isVerifying  = false;
let qualityFilter = true;

let filteredCache = [];
let rawgCursor    = 1;
let rawgExhausted = false;
const MAX_FETCHES_PER_CLICK = 9;
const FETCH_BATCH_SIZE      = 3;

const QUALITY_PARENT_PLATFORMS = '1,2,3,7';
const QUALITY_STORES           = '1,2,3,5,6,7,11';

let userCustomLists = [];

let allFilterOptions = {
    genres:     new Map(),
    platforms:  new Map(),
    publishers: new Map(),
    developers: new Map()
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

const JUNK_KEYWORDS = ['demo', 'soundtrack', 'ost', 'prologue', 'playtest', 'beta', 'prototype', 'artbook', 'wallpaper'];
const JUNK_REGEX    = new RegExp('\\b(' + JUNK_KEYWORDS.join('|') + ')\\b', 'i');

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initialOf(name) {
    var s = (name || '').trim();
    return (s.charAt(0) || '?').toUpperCase();
}

function isEditionVariant(name) {
    if (!name) return false;
    var lower = name.toLowerCase();
    return EDITION_KEYWORDS.some(function(kw) { return lower.includes(kw); });
}

function isJunkVariant(name) {
    if (!name) return false;
    return JUNK_REGEX.test(name);
}

function isLowQuality(game) {
    var added         = game.added         || 0;
    var ratingsCount  = game.ratings_count || 0;
    var hasMetacritic = !!game.metacritic;
    return added < 5 && !hasMetacritic && ratingsCount < 3;
}

function isHighQuality(game) {
    var added       = game.added         || 0;
    var meta        = game.metacritic    || 0;
    var ratings     = game.ratings_count || 0;
    return added >= 50 || meta >= 60 || ratings >= 30;
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

    var qualityToggle = document.getElementById('qualityFilterToggle');
    if (qualityToggle) {
        qualityToggle.checked = qualityFilter;
        qualityToggle.addEventListener('change', function() {
            qualityFilter = qualityToggle.checked;
            currentPage   = 1;
            retryCount    = 0;
            window.scrollTo(0, 0);
            fetchGames(true);
        });
    }

    var sortBySelect = document.getElementById('sortBy');
    sortBySelect.value = 'trending-desc';
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

        currentPage = 1;
        retryCount  = 0;
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

    loadRAWGFilters();
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

async function loadRAWGFilters() {
    try {
        var requests = [
            fetch(`${API_BASE}/rawg/genres?page_size=40`).then(function(r) { return r.ok ? r.json() : { results: [] }; }),
            fetch(`${API_BASE}/rawg/platforms?page_size=50`).then(function(r) { return r.ok ? r.json() : { results: [] }; }),
            fetch(`${API_BASE}/rawg/publishers?page_size=40`).then(function(r) { return r.ok ? r.json() : { results: [] }; }),
            fetch(`${API_BASE}/rawg/developers?page_size=40`).then(function(r) { return r.ok ? r.json() : { results: [] }; })
        ];

        var results = await Promise.all(requests);
        var genres     = results[0].results || [];
        var platforms  = results[1].results || [];
        var publishers = results[2].results || [];
        var developers = results[3].results || [];

        genres.forEach(function(g) {
            if (g && g.slug && g.name) allFilterOptions.genres.set(g.slug, g.name);
        });
        platforms.forEach(function(p) {
            if (p && p.id && p.name) allFilterOptions.platforms.set(String(p.id), p.name);
        });
        publishers.forEach(function(p) {
            if (p && p.slug && p.name) allFilterOptions.publishers.set(p.slug, p.name);
        });
        developers.forEach(function(d) {
            if (d && d.slug && d.name) allFilterOptions.developers.set(d.slug, d.name);
        });

        populateFilterOptions();
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

function rawgFormatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function formatReleaseInfo(released, tba) {
    var d   = released ? new Date(released) : null;
    var now = new Date();
    var hasFutureDate = d && d.getTime() > now.getTime();
    var isUnreleased  = !!tba || hasFutureDate;

    if (isUnreleased) {
        if (hasFutureDate) {
            return {
                label:        'Releases',
                long:         d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                short:        d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                isUnreleased: true
            };
        }
        return { label: 'Release date', long: 'TBA', short: 'TBA', isUnreleased: true };
    }
    if (d) {
        return {
            label:        'Released',
            long:         d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            short:        d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
            isUnreleased: false
        };
    }
    return null;
}

function searchTokens(q) {
    if (!q) return [];
    return q.toLowerCase()
        .replace(/[^\w\s:'-]/g, ' ')
        .split(/\s+/)
        .filter(function(t) { return t && t.length >= 2; });
}

function shouldEnforceTokenFilter(query, tokens) {
    if (query.length < 4) return false;
    return tokens.length >= 2 || query.length >= 4;
}

function shouldRerank(query) {
    return query.length >= 4;
}

function nameMatchesTokens(name, tokens, requireAll) {
    if (!tokens.length) return true;
    var lower = (name || '').toLowerCase();
    if (requireAll) {
        return tokens.every(function(t) { return lower.indexOf(t) !== -1; });
    }
    return tokens.some(function(t) { return lower.indexOf(t) !== -1; });
}

function stripLeadingArticle(s) {
    return s.replace(/^(the |a |an )/, '');
}

function isPrefixMatch(n, q) {
    return n.indexOf(q + ' ')  === 0
        || n.indexOf(q + ':')  === 0
        || n.indexOf(q + ' -') === 0
        || n.indexOf(q + '-')  === 0;
}

function searchScore(name, query, tokens, added) {
    var n  = (name  || '').toLowerCase();
    var q  = (query || '').toLowerCase().trim();
    var na = stripLeadingArticle(n);
    var base = 0;

    if (!q) return 0;

    if (n === q || na === q) {
        base = 5000;
    } else if (isPrefixMatch(n, q) || isPrefixMatch(na, q)) {
        base = 3000;
    } else if (n.indexOf(q) !== -1) {
        base = 1500;
    } else {
        var present = tokens.filter(function(t) { return n.indexOf(t) !== -1; }).length;
        if (tokens.length && present === tokens.length) base = 800;
        else if (present > 0)                           base = 200;
    }

    var pop = Math.log10(Math.max(added || 0, 1) + 1) * 100;
    return base + pop;
}

function transformRAWGGame(game) {
    var nowTs      = Date.now();
    var releasedTs = game.released ? new Date(game.released).getTime() : 0;

    var displayRating = null;
    if (game.rating)      displayRating = Number(game.rating).toFixed(1);
    else if (game.metacritic) displayRating = (game.metacritic / 20).toFixed(1);

    var metaScore = game.metacritic ? Math.round(game.metacritic) : null;

    var platforms = (game.platforms || []).map(function(p) {
        if (p && p.platform) return { id: p.platform.id, name: p.platform.name };
        return p && p.name ? { name: p.name } : null;
    }).filter(Boolean);

    var publishers = (game.publishers || []).map(function(p) { return { id: p.id, name: p.name }; });
    var developers = (game.developers || []).map(function(d) { return { id: d.id, name: d.name }; });

    return {
        id:               'rawg_' + game.id,
        rawg_id:          game.id,
        name:             game.name,
        background_image: game.background_image || null,
        rating:           displayRating,
        description:      '',
        released:         game.released || null,
        tba:              !!game.tba,
        metacritic_score: metaScore,
        rating_count:     game.ratings_count || 0,
        playtime:         game.playtime || 0,
        added:            game.added || 0,
        genres:           (game.genres || []).map(function(g) { return { id: g.id, name: g.name, slug: g.slug }; }),
        platforms:        platforms,
        publishers:       publishers,
        developers:       developers,
        is_coming_soon:   !!game.tba || releasedTs > nowTs
    };
}

function buildRawgParams(rawgPage, isSearchMode, isComingSoon, isPopularity, isTrending) {
    var params = new URLSearchParams();
    params.set('page',      rawgPage);
    params.set('page_size', apiGamesPerPage);
    params.set('exclude_additions', 'true');

    if (currentFilters.search) {
        var searchQ = currentFilters.search.trim();
        params.set('search', searchQ);
        if (searchQ.length >= 4) params.set('search_precise', 'true');
    }
    if (currentFilters.genre)     params.set('genres',     currentFilters.genre);
    if (currentFilters.platform)  params.set('platforms',  currentFilters.platform);
    if (currentFilters.publisher) params.set('publishers', currentFilters.publisher);
    if (currentFilters.developer) params.set('developers', currentFilters.developer);

    if (qualityFilter) {
        if (!currentFilters.platform)         params.set('parent_platforms', QUALITY_PARENT_PLATFORMS);
        if (!isSearchMode && !isComingSoon)   params.set('stores',           QUALITY_STORES);
    }

    var today    = new Date();
    var todayStr = rawgFormatDate(today);

    if (isComingSoon) {
        var tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        params.set('dates', rawgFormatDate(tomorrow) + ',2099-12-31');
    } else if (isTrending && !isSearchMode) {
        var yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
        params.set('dates', rawgFormatDate(yearAgo) + ',' + todayStr);
    } else if (!isSearchMode) {
        params.set('dates', '1970-01-01,' + todayStr);
    }

    var ordering = '-released';
    if (isComingSoon || isPopularity || isTrending) {
        ordering = '-added';
    } else {
        var prefix = currentSortOrder === 'asc' ? '' : '-';
        switch (currentSort) {
            case 'rating':  ordering = prefix + 'rating';   break;
            case 'name':    ordering = prefix + 'name';     break;
            case 'release': ordering = prefix + 'released'; break;
            default:        ordering = prefix + 'released'; break;
        }
    }
    params.set('ordering', ordering);

    return params;
}

function filterRawgBatch(rawResults, ctx) {
    var results = rawResults;

    if (ctx.isComingSoon) {
        results = results.filter(function(g) {
            return g.released && new Date(g.released).getTime() > Date.now();
        });
    } else if (!ctx.isSearchMode) {
        results = results.filter(function(g) {
            return g.released && new Date(g.released).getTime() <= Date.now();
        });
    }

    if (!ctx.searchTermIsEdition) {
        results = results.filter(function(g) { return !isEditionVariant(g.name); });
    }
    if (!ctx.searchTermIsJunk) {
        results = results.filter(function(g) { return !isJunkVariant(g.name); });
    }

    if (qualityFilter && !ctx.isSearchMode) {
        var useStrictFloor = ctx.isTrending || ctx.isPopularity || currentSort === 'name';
        if (useStrictFloor) {
            results = results.filter(isHighQuality);
        } else {
            results = results.filter(function(g) { return !isLowQuality(g); });
        }
    }

    if (ctx.isSearchMode && shouldEnforceTokenFilter(ctx.searchLower, ctx.searchTokensList)) {
        var requireAll = ctx.searchTokensList.length >= 2;
        results = results.filter(function(g) {
            return nameMatchesTokens(g.name, ctx.searchTokensList, requireAll);
        });
    }

    return results;
}

function resetPaginationState() {
    filteredCache = [];
    rawgCursor    = 1;
    rawgExhausted = false;
    hasMoreGames  = true;
}

async function fetchGames(reset) {
    if (reset === undefined) reset = true;
    if (isLoading) return;
    if (!reset && !hasMoreGames) return;

    isLoading = true;
    document.getElementById('loadingIndicator').style.display = 'flex';

    try {
        if (reset) resetPaginationState();

        var isSearchMode = !!(currentFilters.search && currentFilters.search.trim());
        var isComingSoon = currentSort === 'coming' && currentSortOrder === 'soon';
        var isPopularity = currentSort === 'popularity';
        var isTrending   = currentSort === 'trending';

        var searchLower      = isSearchMode ? currentFilters.search.toLowerCase().trim() : '';
        var searchTokensList = isSearchMode ? searchTokens(searchLower) : [];

        var ctx = {
            isSearchMode:        isSearchMode,
            isComingSoon:        isComingSoon,
            isPopularity:        isPopularity,
            isTrending:          isTrending,
            searchLower:         searchLower,
            searchTokensList:    searchTokensList,
            searchTermIsEdition: isSearchMode && EDITION_KEYWORDS.some(function(kw) { return searchLower.includes(kw); }),
            searchTermIsJunk:    isSearchMode && JUNK_REGEX.test(searchLower)
        };

        var startIdx = (currentPage - 1) * gamesPerPage;
        var endIdx   = startIdx + gamesPerPage;

        var fetchedThisCall = 0;

        while (filteredCache.length < endIdx && !rawgExhausted && fetchedThisCall < MAX_FETCHES_PER_CLICK) {
            var thisBatchSize = Math.min(FETCH_BATCH_SIZE, MAX_FETCHES_PER_CLICK - fetchedThisCall);
            var pageNums      = [];
            for (var i = 0; i < thisBatchSize; i++) pageNums.push(rawgCursor + i);

            var responses = await Promise.all(pageNums.map(function(pageNum) {
                var params = buildRawgParams(pageNum, isSearchMode, isComingSoon, isPopularity, isTrending);
                return fetch(`${API_BASE}/rawg/games?` + params.toString())
                    .then(function(r) {
                        return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d }; });
                    })
                    .catch(function() { return { ok: false, status: 0, data: null }; });
            }));

            var batchHitEnd = false;
            for (var j = 0; j < responses.length; j++) {
                var res = responses[j];
                if (!res.ok || !res.data) continue;
                var filtered    = filterRawgBatch(res.data.results || [], ctx);
                var transformed = filtered.map(transformRAWGGame);
                filteredCache   = filteredCache.concat(transformed);
                collectFilterOptions(transformed);
                if (!res.data.next) batchHitEnd = true;
            }

            rawgCursor      += thisBatchSize;
            fetchedThisCall += thisBatchSize;
            if (batchHitEnd) rawgExhausted = true;
        }

        if (isSearchMode && shouldRerank(searchLower)) {
            filteredCache.sort(function(a, b) {
                var sa = searchScore(a.name, searchLower, searchTokensList, a.added);
                var sb = searchScore(b.name, searchLower, searchTokensList, b.added);
                return sb - sa;
            });
        }

        var gamesToDisplay = filteredCache.slice(startIdx, endIdx);
        hasMoreGames = filteredCache.length > endIdx;

        displaySearchResults(gamesToDisplay, true);
        updatePaginationButtons();

        if (gamesToDisplay.length === 0) {
            var message;
            if (currentFilters.search) {
                message = 'No games found for "' + currentFilters.search + '".';
            } else if (isComingSoon) {
                message = 'No upcoming games found.';
            } else if (qualityFilter && filteredCache.length === 0) {
                message = 'No quality games match this sort. Try toggling <strong>Quality only</strong> off, or pick a different sort.';
            } else if (currentPage > 1) {
                message = 'No more games to show.';
            } else {
                message = 'No games found.';
            }
            document.getElementById('searchResults').innerHTML =
                '<div class="empty-state">' + message + '</div>';
        }
    } catch (error) {
        console.error('Fetch error:', error);
        document.getElementById('searchResults').innerHTML =
            '<div class="empty-state">Error loading games. Please try again.</div>';
    } finally {
        isLoading = false;
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function collectFilterOptions(games) {
    var changed = false;
    games.forEach(function(game) {
        (game.genres || []).forEach(function(g) {
            if (g && g.slug && !allFilterOptions.genres.has(g.slug)) {
                allFilterOptions.genres.set(g.slug, g.name); changed = true;
            }
        });
        (game.platforms || []).forEach(function(p) {
            if (p && p.id != null) {
                var key = String(p.id);
                if (!allFilterOptions.platforms.has(key)) {
                    allFilterOptions.platforms.set(key, p.name); changed = true;
                }
            }
        });
        (game.publishers || []).forEach(function(p) {
            if (p && p.slug && !allFilterOptions.publishers.has(p.slug)) {
                allFilterOptions.publishers.set(p.slug, p.name); changed = true;
            }
        });
        (game.developers || []).forEach(function(d) {
            if (d && d.slug && !allFilterOptions.developers.has(d.slug)) {
                allFilterOptions.developers.set(d.slug, d.name); changed = true;
            }
        });
    });
    if (changed) populateFilterOptions();
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

    var html = games.map(function(game) {
        var name    = game.name || 'Unknown';
        var initial = initialOf(name);
        var ri      = formatReleaseInfo(game.released, game.tba);

        var releasedHtml = '';
        if (ri) {
            var dateColor = ri.isUnreleased ? '#3b82f6' : '#94a3b8';
            releasedHtml  = '<span style="color:' + dateColor + ';font-size:12px;">' + esc(ri.short) + '</span>';
        }

        var comingSoonBadge = ri && ri.isUnreleased
            ? '<span class="card-coming-soon-badge">COMING SOON</span>'
            : '';

        var genresHtml = (game.genres || []).slice(0, 3).map(function(g) {
            return '<span class="genre-tag">' + esc(g.name) + '</span>';
        }).join('');

        var hasImage   = !!game.background_image;
        var wrapperCls = 'game-image-wrapper' + (hasImage ? '' : ' no-image');
        var imgInner   = hasImage
            ? '<img src="' + esc(game.background_image) + '" alt="' + esc(name) + '" class="game-image" loading="lazy" onerror="this.parentElement.classList.add(\'no-image\')">'
            : '';

        return '<div class="game-card" data-game-id="' + esc(game.id) + '">' +
            '<div class="' + wrapperCls + '" data-initial="' + esc(initial) + '">' +
                imgInner +
                comingSoonBadge +
            '</div>' +
            '<div class="game-info">' +
                '<div class="game-title">' + esc(name) + '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap;">' + releasedHtml + '</div>' +
                '<div class="game-genres">' + genresHtml + '</div>' +
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

        if (gameId.startsWith('rawg_')) {
            var rawgId   = gameId.replace('rawg_', '');
            var response = await fetch(`${API_BASE}/rawg/games/${rawgId}`);
            var detail   = await response.json();

            if (response.ok && detail && detail.id) {
                var displayRating = null;
                if (detail.rating)        displayRating = Number(detail.rating).toFixed(1);
                else if (detail.metacritic) displayRating = (detail.metacritic / 20).toFixed(1);

                var metaScore = detail.metacritic ? Math.round(detail.metacritic) : null;

                var platforms = (detail.platforms || []).map(function(p) {
                    if (p && p.platform) return { id: p.platform.id, name: p.platform.name };
                    return p && p.name ? { name: p.name } : null;
                }).filter(Boolean);

                var publishers = (detail.publishers || []).map(function(p) { return { id: p.id, name: p.name }; });
                var developers = (detail.developers || []).map(function(d) { return { id: d.id, name: d.name }; });

                var heroImg  = detail.background_image_additional || detail.background_image || null;
                var coverImg = detail.background_image || heroImg;

                var description = detail.description_raw
                    || (detail.description ? detail.description.replace(/<[^>]+>/g, '').trim() : '')
                    || 'No description available';

                game = {
                    id:               gameId,
                    rawg_id:          detail.id,
                    name:             detail.name,
                    background_image: coverImg,
                    screenshot_image: heroImg,
                    rating:           displayRating,
                    description:      description,
                    released:         detail.released || null,
                    tba:              !!detail.tba,
                    metacritic_score: metaScore,
                    rating_count:     detail.ratings_count || 0,
                    playtime:         detail.playtime || 0,
                    genres:           (detail.genres || []).map(function(g) { return { id: g.id, name: g.name }; }),
                    platforms:        platforms,
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
                rawg_id:          game.rawg_id,
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

            var name     = game.name || 'Unknown';
            var initial  = initialOf(name);
            var heroBg   = game.screenshot_image || game.background_image || null;
            var coverSrc = game.background_image || heroBg;
            var ri       = formatReleaseInfo(game.released, game.tba);

            var infoItems = [
                ri
                    ? { label: ri.label, value: ri.long }
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
                    return '<option value="custom_' + esc(list.id) + '">' + esc(list.name) + '</option>';
                }).join('')
                : '';

            var genreTagsHtml = '';
            if (game.genres && game.genres.length) {
                genreTagsHtml = '<div class="game-detail-genres">' +
                    game.genres.map(function(g) { return '<span class="game-detail-genre-tag">' + esc(g.name) + '</span>'; }).join('') +
                '</div>';
            }

            var infoGridHtml = '';
            if (infoItems.length) {
                infoGridHtml = '<div class="game-detail-info-grid">' +
                    infoItems.map(function(item) {
                        return '<div class="game-detail-info-item"><div class="game-detail-info-label">' + esc(item.label) + '</div><div class="game-detail-info-value">' + esc(item.value) + '</div></div>';
                    }).join('') +
                '</div>';
            }

            var releasedBadge = ri
                ? '<span class="game-detail-date"' + (ri.isUnreleased ? ' style="color:#3b82f6;"' : '') + '>' + esc(ri.short) + '</span>'
                : '';

            var descText = game.description && game.description.trim()
                ? game.description.trim()
                : 'No description available for this game.';
            var descHtml = '<p class="game-detail-desc">' + esc(descText) + '</p>';

            var heroHtml = heroBg
                ? '<div class="game-detail-hero">' +
                    '<img src="' + esc(heroBg) + '" alt="' + esc(name) + ' banner" class="game-detail-hero-img" loading="lazy" onerror="this.parentElement.classList.add(\'no-image\')">' +
                  '</div>'
                : '<div class="game-detail-hero no-image" data-initial="' + esc(initial) + '"></div>';

            var coverHtml = coverSrc
                ? '<img src="' + esc(coverSrc) + '" alt="' + esc(name) + ' cover" class="game-detail-cover" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;game-detail-cover no-image-cover&quot;>' + esc(initial) + '</div>\'">'
                : '<div class="game-detail-cover no-image-cover">' + esc(initial) + '</div>';

            document.getElementById('gameDetails').innerHTML =
                heroHtml +
                '<div class="game-detail-body">' +
                    '<div class="game-detail-title-row">' +
                        coverHtml +
                        '<div class="game-detail-title-meta">' +
                            '<div class="game-detail-title">' + esc(name) + '</div>' +
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
    function fillSelect(id, map, allLabel) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var currentValue = sel.value;
        var entries = Array.from(map.entries()).sort(function(a, b) {
            return String(a[1]).localeCompare(String(b[1]));
        });
        var html = '<option value="">' + allLabel + '</option>';
        entries.forEach(function(entry) {
            var value = entry[0];
            var label = entry[1];
            html += '<option value="' + value + '"' + (currentValue === value ? ' selected' : '') + '>' + label + '</option>';
        });
        sel.innerHTML = html;
    }

    fillSelect('genre',     allFilterOptions.genres,     'All Genres');
    fillSelect('platform',  allFilterOptions.platforms,  'All Platforms');
    fillSelect('publisher', allFilterOptions.publishers, 'All Publishers');
    fillSelect('developer', allFilterOptions.developers, 'All Developers');
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
    currentPage = 1;
    retryCount  = 0;
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
    retryCount     = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function searchGames() {
    var searchTerm = document.getElementById('searchInput').value.trim();
    currentFilters.search = searchTerm;

    var sortBySelect = document.getElementById('sortBy');
    sortBySelect.value = 'popularity-desc';
    currentSort       = 'popularity';
    currentSortOrder  = 'desc';

    currentPage = 1;
    retryCount  = 0;
    window.scrollTo(0, 0);
    fetchGames(true);
}

function goToPreviousPage() {
    if (currentPage <= 1 || isLoading) return;
    currentPage--;
    retryCount = 0;
    window.scrollTo(0, 0);
    fetchGames(false);
}

function goToNextPage() {
    if (!hasMoreGames || isLoading) return;
    currentPage++;
    retryCount = 0;
    window.scrollTo(0, 0);
    fetchGames(false);
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