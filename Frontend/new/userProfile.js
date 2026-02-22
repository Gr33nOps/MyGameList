const API_BASE = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));
let viewingUserId = null;
let followStatus = { isFollowing: false, followsYou: false };

// ── Collection state ──────────────────────────────────────────────────────
let userGamesCache = [];
let currentSort = 'recently_added';
let currentStatusFilter = 'all';
let currentSearchTerm = '';

// ── Custom lists state ────────────────────────────────────────────────────
let upLists = [];
let upListGames = {};
let upExpandedListId = null;
let upFilters = {};

const STATUS_LABEL = {
    playing: 'Playing',
    completed: 'Completed',
    plan_to_play: 'Plan to Play',
    on_hold: 'On Hold',
    dropped: 'Dropped'
};
const STATUS_COLOR = {
    playing: '#3498db',
    completed: '#2ecc71',
    plan_to_play: '#9b59b6',
    on_hold: '#f39c12',
    dropped: '#e74c3c'
};

// ── Auth check ────────────────────────────────────────────────────────────
if (!authToken) {
    window.location.href = 'index.html';
} else {
    verifyToken();
}

function calculateLevel(gamesPlayed) {
    if (gamesPlayed === 0) return 1;
    const thresholds = [0, 5, 12, 22, 35, 50, 70, 95, 125, 160, 200, 250, 310, 380, 460, 550];
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (gamesPlayed >= thresholds[i]) return i + 1;
    }
    return 1;
}

async function verifyToken() {
    try {
        const r = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            const d = await r.json();
            currentUser = d.user;
            localStorage.setItem('currentUser', JSON.stringify(d.user));
            initPage();
        } else {
            logout();
        }
    } catch (e) {
        console.error('Verify token error:', e);
        logout();
    }
}

// ══════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════
function initPage() {
    const urlParams = new URLSearchParams(window.location.search);
    viewingUserId = parseInt(urlParams.get('userId'));

    if (!viewingUserId || isNaN(viewingUserId)) {
        alert('Invalid user ID. Redirecting to friends page.');
        window.location.href = 'friends.html';
        return;
    }

    if (viewingUserId === currentUser.id) {
        window.location.href = 'profile.html';
        return;
    }

    // ── Page-level tab switching ──
    document.querySelectorAll('.page-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'lists' && upLists.length === 0) {
                upLoadLists();
            }
        });
    });

    // ── Collection tab wiring ──
    document.getElementById('userGamesSort').addEventListener('change', e => {
        currentSort = e.target.value;
        displayUserGames(sortGames(userGamesCache));
    });

    document.getElementById('userGamesSearch').addEventListener('input', e => {
        currentSearchTerm = e.target.value.toLowerCase().trim();
        displayUserGames(sortGames(userGamesCache));
    });

    document.querySelectorAll('#tab-collection .status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#tab-collection .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentStatusFilter = tab.dataset.status;
            displayUserGames(sortGames(userGamesCache));
        });
    });

    // ── Collection game detail modal ──
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('gameModal').addEventListener('click', e => {
        if (e.target.id === 'gameModal') closeModal();
    });

    // ── Custom list game detail modal ──
    document.getElementById('clGameModal').addEventListener('click', e => {
        if (e.target.id === 'clGameModal') upCloseModal('clGameModal');
    });
    document.getElementById('clGameModalClose').addEventListener('click', () => upCloseModal('clGameModal'));

    // ── Delegated click for collection rows ──
    document.addEventListener('click', e => {
        const listItem = e.target.closest('.coll-item.list-item');
        if (listItem && !e.target.classList.contains('btn')) {
            showGameDetails(listItem.dataset.gameId);
        }
    });

    // ── Share / Follow ──
    document.getElementById('shareProfileBtn').addEventListener('click', copyShareLink);

    // Kick off data loading
    loadUserProfile();
    loadUserGames();
}

// ══════════════════════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════════════════════
async function loadUserProfile() {
    try {
        const r = await fetch(`${API_BASE}/users/${viewingUserId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            const d = await r.json();
            displayUserProfile(d.user);
            await checkFollowStatus();
        } else {
            alert('Failed to load user profile.');
            window.location.href = 'friends.html';
        }
    } catch (e) {
        console.error('Load user profile error:', e);
        window.location.href = 'friends.html';
    }
}

function displayUserProfile(user) {
    const avatarUrl = user.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&size=200&background=3b82f6&color=fff&bold=true`;

    document.getElementById('profileTitle').textContent      = `${user.display_name || user.username}'s Profile`;
    document.getElementById('gameListTitle').textContent     = `${user.display_name || user.username}'s Game Collection`;
    document.getElementById('customListsTitle').textContent  = `${user.display_name || user.username}'s Lists`;
    document.getElementById('userAvatar').src                = avatarUrl;
    document.getElementById('displayName').textContent       = user.display_name || '-';
    document.getElementById('displayUsername').textContent   = user.username;
    document.getElementById('displayCreatedAt').textContent  = formatDate(user.created_at);
    document.getElementById('totalGames').textContent        = user.totalGames || 0;
    document.getElementById('userLevel').textContent         = calculateLevel(user.totalGames || 0);
    document.getElementById('followersCount').textContent    = user.followersCount || 0;
    document.getElementById('followingCount').textContent    = user.followingCount || 0;
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION TAB
// ══════════════════════════════════════════════════════════════════════════
async function loadUserGames() {
    try {
        const r = await fetch(`${API_BASE}/users/${viewingUserId}/games`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            const d = await r.json();
            userGamesCache = d.games;
            displayUserGames(sortGames(userGamesCache));
        } else {
            console.error('Failed to load games:', await r.json());
        }
    } catch (e) {
        console.error('Load user games error:', e);
    }
}

function sortGames(games) {
    const s = [...games];
    switch (currentSort) {
        case 'recently_added':
            s.sort((a, b) => a.date_added && b.date_added
                ? new Date(b.date_added) - new Date(a.date_added)
                : b.id - a.id);
            break;
        case 'name':        s.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name_desc':   s.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'score_high':  s.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
        case 'score_low':   s.sort((a, b) => (a.score || 0) - (b.score || 0)); break;
        case 'rating_high': s.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'rating_low':  s.sort((a, b) => (a.rating || 0) - (b.rating || 0)); break;
    }
    return s;
}

function displayUserGames(games) {
    const container = document.getElementById('userGamesList');

    let filtered = games;
    if (currentStatusFilter !== 'all') {
        filtered = filtered.filter(g => g.status === currentStatusFilter);
    }
    if (currentSearchTerm) {
        filtered = filtered.filter(g =>
            g.name.toLowerCase().includes(currentSearchTerm) ||
            (g.genres && g.genres.some(genre => (genre.name || genre).toLowerCase().includes(currentSearchTerm)))
        );
    }

    if (filtered.length === 0) {
        let msg = 'This user has no games in their collection yet.';
        if (currentSearchTerm && currentStatusFilter !== 'all')
            msg = `No games matching "${currentSearchTerm}" with status "${STATUS_LABEL[currentStatusFilter] || currentStatusFilter}".`;
        else if (currentSearchTerm)
            msg = `No games matching "${currentSearchTerm}".`;
        else if (currentStatusFilter !== 'all')
            msg = `No games with status "${STATUS_LABEL[currentStatusFilter] || currentStatusFilter}".`;
        container.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon">🎮</div><p>${msg}</p></div>`;
        return;
    }

    container.innerHTML = filtered.map(game => renderCollectionRow(game)).join('');
}

function renderCollectionRow(game) {
    const statusColor = STATUS_COLOR[game.status] || '#666';
    const statusLabel = STATUS_LABEL[game.status] || game.status;
    const imgSrc = game.background_image || 'https://via.placeholder.com/56x56/1e293b/64748b?text=?';

    return `<div class="coll-item list-item" data-game-id="${game.id}">
        <img src="${imgSrc}" alt="${esc(game.name)}" class="coll-item-img" loading="lazy"
             onerror="this.src='https://via.placeholder.com/56x56/1e293b/64748b?text=?'">
        <div class="coll-item-body">
            <div class="coll-item-main">
                <div class="coll-item-name">${esc(game.name)}</div>
                <div class="coll-item-meta">
                    <span class="status-dot-inline" style="background:${statusColor};"></span>
                    <span class="coll-item-status">${statusLabel}</span>
                </div>
            </div>
            <div class="coll-item-right">
                <div class="coll-score-badge">${game.score ? game.score : '–'}</div>
            </div>
        </div>
    </div>`;
}

async function showGameDetails(gameId) {
    try {
        const r = await fetch(`${API_BASE}/games/${gameId}`);
        const game = await r.json();
        if (!r.ok) return;

        const ratingColor = s => !s ? '#666' : s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 50 ? '#f59e0b' : '#ef4444';
        const heroBg = game.background_image || 'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image';
        const rc = ratingColor(game.metacritic_score);

        const infoItems = [
            game.released    ? { label: 'Released',  value: new Date(game.released).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) } : null,
            game.publishers?.length ? { label: 'Publisher', value: game.publishers.map(p => p.name).join(', ') } : null,
            game.developers?.length ? { label: 'Developer', value: game.developers.map(d => d.name).join(', ') } : null,
            game.platforms?.length  ? { label: 'Platforms',  value: game.platforms.map(p => p.name).join(' · ') } : null,
        ].filter(Boolean);

        document.getElementById('gameDetails').innerHTML = `
            <div class="game-detail-hero">
                <img src="${heroBg}" alt="${esc(game.name)} banner" class="game-detail-hero-img" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image'">
            </div>
            <div class="game-detail-body">
                <div class="game-detail-title-row">
                    <img src="${heroBg}" alt="${esc(game.name)} cover" class="game-detail-cover" loading="lazy"
                         onerror="this.src='https://via.placeholder.com/100x134/1e293b/64748b?text=?'">
                    <div class="game-detail-title-meta">
                        <div class="game-detail-title">${esc(game.name)}</div>
                        <div class="game-detail-badges">
                            <span class="game-detail-score" style="background:${rc};">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                                ${game.metacritic_score ? `${game.metacritic_score}/100` : 'No Rating'}
                            </span>
                            ${game.released ? `<span class="game-detail-date">${new Date(game.released).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</span>` : ''}
                        </div>
                    </div>
                </div>
                ${(game.genres||[]).length ? `<div class="game-detail-genres">${game.genres.map(g=>`<span class="game-detail-genre-tag">${g.name}</span>`).join('')}</div>` : ''}
                ${infoItems.length ? `<div class="game-detail-info-grid">${infoItems.map(i=>`<div class="game-detail-info-item"><div class="game-detail-info-label">${i.label}</div><div class="game-detail-info-value">${i.value}</div></div>`).join('')}</div>` : ''}
                ${game.description ? `<p class="game-detail-desc">${game.description}</p>` : ''}
            </div>`;

        document.getElementById('gameModal').style.display = 'flex';
    } catch (e) {
        console.error('Show game details error:', e);
    }
}

function closeModal() {
    document.getElementById('gameModal').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════════════
// CUSTOM LISTS TAB — PUBLIC ONLY, READ-ONLY ACCORDION
// ══════════════════════════════════════════════════════════════════════════
async function upLoadLists() {
    try {
        const r = await fetch(`${API_BASE}/users/${viewingUserId}/lists`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
        const d = await r.json();
        upLists = d.lists;
        upRenderAccordion();
    } catch (e) {
        upShowToast(e.message, 'error');
    }
}

function upRenderAccordion() {
    const container = document.getElementById('upAccordion');
    if (upLists.length === 0) {
        container.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon">📋</div><p>This user has no public lists yet.</p></div>`;
        return;
    }
    container.innerHTML = upLists.map(list => upRenderAccordionRow(list)).join('');

    // Wire accordion toggles
    container.querySelectorAll('.up-acc-header').forEach(header => {
        header.addEventListener('click', () => {
            const listId = parseInt(header.closest('.cl-acc-row').dataset.listId);
            upToggleAccordion(listId);
        });
    });

    // Re-expand previously expanded list if any
    if (upExpandedListId) {
        const row = container.querySelector(`.cl-acc-row[data-list-id="${upExpandedListId}"]`);
        if (row) upExpandRow(row, upExpandedListId, false);
    }
}

function upRenderAccordionRow(list) {
    const count = list.game_count || 0;
    const isExpanded = upExpandedListId === list.id;
    return `<div class="cl-acc-row ${isExpanded ? 'expanded' : ''}" data-list-id="${list.id}">
        <div class="up-acc-header cl-acc-header">
            <div class="cl-acc-header-left">
                <span class="cl-acc-chevron">${isExpanded ? '▼' : '▶'}</span>
                <div class="cl-acc-title-group">
                    <div class="cl-acc-title-row">
                        <span class="cl-acc-name">${esc(list.name)}</span>
                        <span class="pill">${count} ${count === 1 ? 'game' : 'games'}</span>
                    </div>
                    ${list.description ? `<div class="cl-acc-desc">${esc(list.description)}</div>` : ''}
                </div>
            </div>
        </div>
        <div class="cl-acc-body ${isExpanded ? '' : 'hidden'}" id="up-acc-body-${list.id}"></div>
    </div>`;
}

async function upToggleAccordion(listId) {
    const container = document.getElementById('upAccordion');
    const row = container.querySelector(`.cl-acc-row[data-list-id="${listId}"]`);
    if (!row) return;

    const isCurrentlyExpanded = upExpandedListId === listId;

    // Collapse all rows first
    container.querySelectorAll('.cl-acc-row').forEach(r => {
        r.classList.remove('expanded');
        r.querySelector('.cl-acc-chevron').textContent = '▶';
        r.querySelector('.cl-acc-body').classList.add('hidden');
    });

    if (isCurrentlyExpanded) {
        upExpandedListId = null;
        return;
    }

    upExpandedListId = listId;
    upExpandRow(row, listId, true);
}

async function upExpandRow(row, listId, doFetch) {
    row.classList.add('expanded');
    row.querySelector('.cl-acc-chevron').textContent = '▼';
    const body = row.querySelector('.cl-acc-body');
    body.classList.remove('hidden');

    if (!upFilters[listId]) {
        upFilters[listId] = { search: '', sort: 'recently_added', status: 'all' };
    }

    if (doFetch || !upListGames[listId]) {
        body.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon" style="font-size:1.5rem;">⏳</div><p>Loading…</p></div>`;
        try {
            const r = await fetch(`${API_BASE}/users/${viewingUserId}/lists/${listId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
            const d = await r.json();
            upListGames[listId] = d.list.games || [];
        } catch (e) {
            body.innerHTML = `<div class="coll-empty-state"><p>Failed to load games.</p></div>`;
            return;
        }
    }

    upRenderListBody(listId);
}

function upRenderListBody(listId) {
    const body = document.getElementById(`up-acc-body-${listId}`);
    if (!body) return;
    const f = upFilters[listId];

    body.innerHTML = `
        <div class="cl-acc-toolbar">
            <div class="cl-acc-list-header">
                <div class="cl-acc-list-header-inputs">
                    <input type="text" class="search-input up-acc-search" placeholder="Search games…" value="${esc(f.search)}">
                    <select class="filter-select up-acc-sort">
                        <option value="recently_added" ${f.sort === 'recently_added' ? 'selected' : ''}>Recently Added</option>
                        <option value="name"           ${f.sort === 'name'           ? 'selected' : ''}>Name (A-Z)</option>
                        <option value="name_desc"      ${f.sort === 'name_desc'      ? 'selected' : ''}>Name (Z-A)</option>
                        <option value="score_high"     ${f.sort === 'score_high'     ? 'selected' : ''}>Score (High to Low)</option>
                        <option value="score_low"      ${f.sort === 'score_low'      ? 'selected' : ''}>Score (Low to High)</option>
                    </select>
                </div>
            </div>
            <div class="status-tabs cl-acc-status-tabs">
                ${['all', 'playing', 'completed', 'plan_to_play', 'on_hold', 'dropped'].map(s =>
                    `<button class="status-tab ${f.status === s ? 'active' : ''}" data-status="${s}">${s === 'all' ? 'All Games' : STATUS_LABEL[s]}</button>`
                ).join('')}
            </div>
        </div>
        <div class="my-games-list" id="up-acc-games-${listId}"></div>
    `;

    body.querySelector('.up-acc-search').addEventListener('input', e => {
        upFilters[listId].search = e.target.value.toLowerCase().trim();
        upRenderAccGames(listId);
    });
    body.querySelector('.up-acc-sort').addEventListener('change', e => {
        upFilters[listId].sort = e.target.value;
        upRenderAccGames(listId);
    });
    body.querySelectorAll('.cl-acc-status-tabs .status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            upFilters[listId].status = tab.dataset.status;
            body.querySelectorAll('.cl-acc-status-tabs .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            upRenderAccGames(listId);
        });
    });

    upRenderAccGames(listId);
}

function upRenderAccGames(listId) {
    const container = document.getElementById(`up-acc-games-${listId}`);
    if (!container) return;
    const f = upFilters[listId];
    let games = [...(upListGames[listId] || [])];

    // Filter by status
    if (f.status !== 'all') games = games.filter(g => g.status === f.status);

    // Filter by search
    if (f.search) games = games.filter(g => g.name.toLowerCase().includes(f.search));

    // Sort
    switch (f.sort) {
        case 'name':           games.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name_desc':      games.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'score_high':     games.sort((a, b) => (b.user_score || 0) - (a.user_score || 0)); break;
        case 'score_low':      games.sort((a, b) => (a.user_score || 0) - (b.user_score || 0)); break;
        case 'recently_added':
        default:               games.sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0)); break;
    }

    if (games.length === 0) {
        const msg = f.search
            ? `No games matching "${f.search}".`
            : f.status !== 'all'
                ? `No games with status "${STATUS_LABEL[f.status] || f.status}".`
                : 'No games in this list yet.';
        container.innerHTML = `<div class="coll-empty-state" style="padding:30px 20px;"><div class="coll-empty-icon">🎮</div><p>${msg}</p></div>`;
        return;
    }

    container.innerHTML = games.map(g => upRenderGameRow(g)).join('');

    // Wire row clicks for game details
    container.querySelectorAll('.cl-list-item[data-game-id]').forEach(row => {
        row.addEventListener('click', () => upShowGameDetails(row.dataset.gameId));
    });
}

function upRenderGameRow(g) {
    const score = g.user_score ? g.user_score : '–';
    const statusColor = STATUS_COLOR[g.status] || '#555';
    const statusLabel = STATUS_LABEL[g.status] || (g.status ? g.status : 'No Status');
    const imgSrc = g.background_image || 'https://via.placeholder.com/56x56/1e293b/64748b?text=?';

    return `<div class="coll-item cl-list-item" data-game-id="${g.game_id}">
        <img src="${imgSrc}" alt="${esc(g.name)}" class="coll-item-img" loading="lazy"
             onerror="this.src='https://via.placeholder.com/56x56/1e293b/64748b?text=?'">
        <div class="coll-item-body">
            <div class="coll-item-main">
                <div class="coll-item-name">${esc(g.name)}</div>
                <div class="coll-item-meta">
                    ${statusLabel !== 'No Status'
                        ? `<span class="status-dot-inline" style="background:${statusColor};"></span>
                           <span class="coll-item-status">${statusLabel}</span>`
                        : `<span class="coll-item-status" style="color:var(--text-dim);">No status</span>`}
                </div>
            </div>
            <div class="coll-item-right">
                <div class="coll-score-badge">${score}</div>
            </div>
        </div>
    </div>`;
}

async function upShowGameDetails(gameId) {
    try {
        const r = await fetch(`${API_BASE}/games/${gameId}`);
        const game = await r.json();
        if (!r.ok) return;

        const ratingColor = s => !s ? '#666' : s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 50 ? '#f59e0b' : '#ef4444';
        const heroBg = game.background_image || 'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image';
        const rc = ratingColor(game.metacritic_score);

        const infoItems = [
            game.released    ? { label: 'Released',  value: new Date(game.released).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) } : null,
            game.publishers?.length ? { label: 'Publisher', value: game.publishers.map(p => p.name).join(', ') } : null,
            game.developers?.length ? { label: 'Developer', value: game.developers.map(d => d.name).join(', ') } : null,
            game.platforms?.length  ? { label: 'Platforms',  value: game.platforms.map(p => p.name).join(' · ') } : null,
        ].filter(Boolean);

        document.getElementById('clGameDetails').innerHTML = `
            <div class="game-detail-hero">
                <img src="${heroBg}" alt="${esc(game.name)} banner" class="game-detail-hero-img" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image'">
            </div>
            <div class="game-detail-body">
                <div class="game-detail-title-row">
                    <img src="${heroBg}" alt="${esc(game.name)} cover" class="game-detail-cover" loading="lazy"
                         onerror="this.src='https://via.placeholder.com/100x134/1e293b/64748b?text=?'">
                    <div class="game-detail-title-meta">
                        <div class="game-detail-title">${esc(game.name)}</div>
                        <div class="game-detail-badges">
                            <span class="game-detail-score" style="background:${rc};">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                                ${game.metacritic_score ? `${game.metacritic_score}/100` : 'No Rating'}
                            </span>
                            ${game.released ? `<span class="game-detail-date">${new Date(game.released).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</span>` : ''}
                        </div>
                    </div>
                </div>
                ${(game.genres||[]).length ? `<div class="game-detail-genres">${game.genres.map(g=>`<span class="game-detail-genre-tag">${g.name}</span>`).join('')}</div>` : ''}
                ${infoItems.length ? `<div class="game-detail-info-grid">${infoItems.map(i=>`<div class="game-detail-info-item"><div class="game-detail-info-label">${i.label}</div><div class="game-detail-info-value">${i.value}</div></div>`).join('')}</div>` : ''}
                ${game.description ? `<p class="game-detail-desc">${game.description}</p>` : ''}
            </div>`;

        upOpenModal('clGameModal');
    } catch (e) {
        console.error('Show CL game details error:', e);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// FOLLOW / UNFOLLOW
// ══════════════════════════════════════════════════════════════════════════
async function checkFollowStatus() {
    try {
        const r = await fetch(`${API_BASE}/follow/status/${viewingUserId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            followStatus = await r.json();
            updateFollowButton();
        }
    } catch (e) {
        console.error('Check follow status error:', e);
    }
}

function updateFollowButton() {
    const btn = document.getElementById('followActionBtn');
    if (followStatus.isFollowing) {
        btn.textContent = 'Following';
        btn.className   = 'btn btn-secondary btn-sm';
        btn.onclick     = unfollowUser;
    } else {
        btn.textContent = 'Follow';
        btn.className   = 'btn btn-success btn-sm';
        btn.onclick     = followUser;
    }
}

async function followUser() {
    try {
        const r = await fetch(`${API_BASE}/follow/${viewingUserId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            await checkFollowStatus();
            await loadUserProfile();
        } else {
            const d = await r.json();
            alert('Failed to follow user: ' + (d.error || 'Unknown error'));
        }
    } catch (e) {
        console.error('Follow user error:', e);
        alert('Error following user. Please try again.');
    }
}

async function unfollowUser() {
    if (!confirm('Are you sure you want to unfollow this user?')) return;
    try {
        const r = await fetch(`${API_BASE}/follow/${viewingUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (r.ok) {
            await checkFollowStatus();
            await loadUserProfile();
        } else {
            const d = await r.json();
            alert('Failed to unfollow user: ' + (d.error || 'Unknown error'));
        }
    } catch (e) {
        console.error('Unfollow user error:', e);
        alert('Error unfollowing user. Please try again.');
    }
}

// ══════════════════════════════════════════════════════════════════════════
// SHARE PROFILE
// ══════════════════════════════════════════════════════════════════════════
function copyShareLink() {
    const url = `${window.location.origin}/userProfile.html?userId=${viewingUserId}`;
    const feedback = document.getElementById('shareFeedback');
    const show = () => {
        feedback.style.display = 'inline';
        setTimeout(() => { feedback.style.display = 'none'; }, 1800);
    };
    navigator.clipboard.writeText(url).then(show).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        show();
    });
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════════════════════
function upOpenModal(id)  { document.getElementById(id).classList.add('open');    document.body.style.overflow = 'hidden'; }
function upCloseModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; }

let _upToastTimer;
function upShowToast(msg, type = '') {
    const el = document.getElementById('clToast');
    el.textContent = msg;
    el.className   = `cl-toast ${type}`;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(_upToastTimer);
    _upToastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════════════════════════
function esc(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}
window.logout = logout;