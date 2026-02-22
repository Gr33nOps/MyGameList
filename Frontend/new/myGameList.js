/* ═══════════════════════════════════════════════════════════════════════════
   myGameList.js  —  My Collection tab + Custom Lists tab
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));

// ── Collection state ──────────────────────────────────────────────────────
let myGamesCache = [];
let currentMyGamesSort = 'recently_added';
let currentStatusFilter = 'all';
let currentSearchTerm = '';
let isEditMode = false;
let currentUpdateGameId = null;
let currentRemoveGameId = null;
let currentRemoveGameName = null;

// ── Custom lists state ────────────────────────────────────────────────────
let clLists = [];
let clListGames = {};
let clEditingId = null;
let clRemoveGameId = null;
let clExpandedListId = null;
let clIsEditMode = {};
let clFilters = {};
let _clPendingDeleteId = null;

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════
if (!authToken) {
    window.location.href = 'home.html';
} else {
    verifyToken();
}

async function verifyToken() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            initPage();
        } else {
            logout();
        }
    } catch (error) {
        console.error('Verify token error:', error);
        logout();
    }
}

// ══════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════
function initPage() {
    initPageTabs();
    initCollectionTab();
    initCustomListsTab();
}

function initPageTabs() {
    document.querySelectorAll('.page-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'lists' && clLists.length === 0) {
                clLoadLists();
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════
// ── COLLECTION TAB ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function initCollectionTab() {
    document.querySelectorAll('.status-tab:not(.cl-status-tab)').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.status-tab:not(.cl-status-tab)').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentStatusFilter = tab.dataset.status;
            displayMyGames(sortMyGames(myGamesCache));
        });
    });

    // ── Edit / Done button toggle for My Collection ──
    document.getElementById('editListBtn').addEventListener('click', () => toggleEditMode(true));
    document.getElementById('doneEditingBtn').addEventListener('click', () => toggleEditMode(false));

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('confirmUpdateBtn').addEventListener('click', confirmUpdate);
    document.getElementById('cancelUpdateBtn').addEventListener('click', closeUpdateModal);
    document.getElementById('confirmRemoveBtn').addEventListener('click', confirmRemove);
    document.getElementById('cancelRemoveBtn').addEventListener('click', closeRemoveModal);

    const myGamesSortSelect = document.getElementById('myGamesSort');
    myGamesSortSelect.value = 'recently_added';
    myGamesSortSelect.addEventListener('change', () => {
        currentMyGamesSort = myGamesSortSelect.value;
        displayMyGames(sortMyGames(myGamesCache));
    });

    const searchInput = document.getElementById('myGamesSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase().trim();
            displayMyGames(sortMyGames(myGamesCache));
        });
    }

    document.getElementById('gameModal').addEventListener('click', e => { if (e.target.id === 'gameModal') closeModal(); });
    document.getElementById('updateModal').addEventListener('click', e => { if (e.target.id === 'updateModal') closeUpdateModal(); });
    document.getElementById('removeModal').addEventListener('click', e => { if (e.target.id === 'removeModal') closeRemoveModal(); });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('update-btn')) {
            showUpdateModal(e.target.dataset.gameId);
        } else if (e.target.classList.contains('delete-btn')) {
            showRemoveModal(e.target.dataset.gameId, e.target.dataset.gameName);
        } else if (e.target.closest('.coll-item.list-item')) {
            const row = e.target.closest('.coll-item.list-item');
            if (row && row.dataset.gameId &&
                !e.target.classList.contains('update-btn') &&
                !e.target.classList.contains('delete-btn') &&
                !e.target.closest('.coll-item-edit-actions')) {
                showGameDetails(row.dataset.gameId);
            }
        }
    });

    loadMyGames();
}

async function loadMyGames() {
    try {
        const response = await fetch(`${API_BASE}/user/games`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (response.ok) {
            myGamesCache = data.games;
            updateStatistics(data.games);
            displayMyGames(sortMyGames(data.games));
        } else {
            showError(document.getElementById('myGamesGrid'), 'Failed to fetch games. Please try again.');
        }
    } catch (error) {
        console.error('Load my games error:', error);
        showError(document.getElementById('myGamesGrid'), 'Network error. Please try again.');
    }
}

function updateStatistics(games) {
    const stats = {
        total:        games.length,
        playing:      games.filter(g => g.status === 'playing').length,
        completed:    games.filter(g => g.status === 'completed').length,
        plan_to_play: games.filter(g => g.status === 'plan_to_play').length,
        on_hold:      games.filter(g => g.status === 'on_hold').length,
        dropped:      games.filter(g => g.status === 'dropped').length
    };
    const pct = k => stats.total > 0 ? (stats[k] / stats.total * 100).toFixed(1) : 0;
    updateBarChart({
        playing: pct('playing'), completed: pct('completed'),
        plan_to_play: pct('plan_to_play'), on_hold: pct('on_hold'), dropped: pct('dropped')
    }, stats);
    updatePieChart(stats);
}

function updateBarChart(percentages, stats) {
    [
        { id: 'playingBar',   pct: 'playingPercent',   val: percentages.playing,      cnt: stats.playing },
        { id: 'completedBar', pct: 'completedPercent', val: percentages.completed,    cnt: stats.completed },
        { id: 'planBar',      pct: 'planPercent',      val: percentages.plan_to_play, cnt: stats.plan_to_play },
        { id: 'onholdBar',    pct: 'onholdPercent',    val: percentages.on_hold,      cnt: stats.on_hold },
        { id: 'droppedBar',   pct: 'droppedPercent',   val: percentages.dropped,      cnt: stats.dropped }
    ].forEach(b => {
        const barEl = document.getElementById(b.id);
        const pctEl = document.getElementById(b.pct);
        if (barEl && pctEl) {
            setTimeout(() => { barEl.style.width = `${b.val}%`; }, 100);
            pctEl.textContent = `${b.val}% (${b.cnt})`;
        }
    });
}

function updatePieChart(stats) {
    const total = stats.total;
    if (total === 0) {
        document.getElementById('pieChartSvg').innerHTML = '<circle cx="100" cy="100" r="90" fill="#1e2a38" />';
        return;
    }
    const statuses = [
        { count: stats.playing,      color: '#3498db' },
        { count: stats.completed,    color: '#2ecc71' },
        { count: stats.plan_to_play, color: '#9b59b6' },
        { count: stats.on_hold,      color: '#f39c12' },
        { count: stats.dropped,      color: '#e74c3c' }
    ];
    let currentAngle = -90;
    const cx = 100, cy = 100, r = 90;
    let svgPaths = '';
    statuses.filter(s => s.count > 0).forEach(s => {
        const angle = (s.count / total) * 360;
        const sa = currentAngle * (Math.PI / 180);
        const ea = (currentAngle + angle) * (Math.PI / 180);
        const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
        const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
        svgPaths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2} Z" fill="${s.color}" />`;
        currentAngle += angle;
    });
    document.getElementById('pieChartSvg').innerHTML = svgPaths;
}

function sortMyGames(games) {
    const sorted = [...games];
    switch (currentMyGamesSort) {
        case 'recently_added': sorted.sort((a,b) => a.created_at && b.created_at ? new Date(b.created_at)-new Date(a.created_at) : b.id-a.id); break;
        case 'name':           sorted.sort((a,b) => a.name.localeCompare(b.name)); break;
        case 'name_desc':      sorted.sort((a,b) => b.name.localeCompare(a.name)); break;
        case 'score_high':     sorted.sort((a,b) => (b.score||0)-(a.score||0)); break;
        case 'score_low':      sorted.sort((a,b) => (a.score||0)-(b.score||0)); break;
        case 'rating_high':    sorted.sort((a,b) => (b.rating||0)-(a.rating||0)); break;
        case 'rating_low':     sorted.sort((a,b) => (a.rating||0)-(b.rating||0)); break;
    }
    return sorted;
}

const STATUS_LABEL = { playing:'Playing', completed:'Completed', plan_to_play:'Plan to Play', on_hold:'On Hold', dropped:'Dropped' };
const STATUS_COLOR = { playing:'#3498db', completed:'#2ecc71', plan_to_play:'#9b59b6', on_hold:'#f39c12', dropped:'#e74c3c' };

function getRatingColor(score) {
    if (!score) return '#666';
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
}

function displayMyGames(games) {
    const container = document.getElementById('myGamesGrid');
    let filtered = games;
    if (currentStatusFilter !== 'all') filtered = games.filter(g => g.status === currentStatusFilter);
    if (currentSearchTerm) {
        filtered = filtered.filter(g =>
            g.name.toLowerCase().includes(currentSearchTerm) ||
            (g.genres && g.genres.some(genre => (genre.name||genre).toLowerCase().includes(currentSearchTerm)))
        );
    }
    if (filtered.length === 0) {
        let msg = 'Your game list is empty. Add games from the home page!';
        if (currentSearchTerm && currentStatusFilter !== 'all') msg = `No games matching "${currentSearchTerm}" with status "${STATUS_LABEL[currentStatusFilter] || currentStatusFilter}".`;
        else if (currentSearchTerm) msg = `No games matching "${currentSearchTerm}".`;
        else if (currentStatusFilter !== 'all') msg = `No games with status "${STATUS_LABEL[currentStatusFilter] || currentStatusFilter}".`;
        container.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon">🎮</div><p>${msg}</p></div>`;
        return;
    }

    container.innerHTML = filtered.map(game => renderCollectionRow(game)).join('');
}

function renderCollectionRow(game) {
    const statusColor = STATUS_COLOR[game.status] || '#666';
    const statusLabel = STATUS_LABEL[game.status] || game.status;
    const imgSrc = game.background_image || 'https://via.placeholder.com/56x56/1e293b/64748b?text=?';

    const editActions = isEditMode ? `
        <div class="coll-item-edit-actions">
            <button class="btn btn-secondary btn-sm update-btn" data-game-id="${game.game_id}">Edit</button>
            <button class="btn btn-danger btn-sm delete-btn" data-game-id="${game.game_id}" data-game-name="${esc(game.name)}">Remove</button>
        </div>` : '';

    return `<div class="coll-item list-item" data-game-id="${game.game_id}">
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
                ${editActions}
            </div>
        </div>
    </div>`;
}

async function showGameDetails(gameId) {
    try {
        const response = await fetch(`${API_BASE}/games/${gameId}`);
        const game = await response.json();
        if (!response.ok) return;

        const ratingColor = s => !s ? '#666' : s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 50 ? '#f59e0b' : '#ef4444';
        const heroBg = game.background_image || 'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image';
        const rc = ratingColor(game.metacritic_score);

        const infoItems = [
            game.released ? { label: 'Released', value: new Date(game.released).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) } : null,
            game.publishers?.length ? { label: 'Publisher', value: game.publishers.map(p=>p.name).join(', ') } : null,
            game.developers?.length ? { label: 'Developer', value: game.developers.map(d=>d.name).join(', ') } : null,
            game.platforms?.length  ? { label: 'Platforms',  value: game.platforms.map(p=>p.name).join(' · ') } : null,
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
                            ${game.released ? `<span class="game-detail-date">${new Date(game.released).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</span>` : ''}
                        </div>
                    </div>
                </div>
                ${(game.genres||[]).length ? `<div class="game-detail-genres">${game.genres.map(g=>`<span class="game-detail-genre-tag">${g.name}</span>`).join('')}</div>` : ''}
                ${infoItems.length ? `<div class="game-detail-info-grid">${infoItems.map(i=>`<div class="game-detail-info-item"><div class="game-detail-info-label">${i.label}</div><div class="game-detail-info-value">${i.value}</div></div>`).join('')}</div>` : ''}
                ${game.description ? `<p class="game-detail-desc">${game.description}</p>` : ''}
            </div>`;

        document.getElementById('gameModal').style.display = 'flex';
    } catch (error) {
        console.error('Show game details error:', error);
    }
}

// ── Toggle Edit mode for My Collection ────────────────────────────────────
function toggleEditMode(isEdit) {
    isEditMode = isEdit;
    document.getElementById('editListBtn').style.display    = isEdit ? 'none' : 'inline-block';
    document.getElementById('doneEditingBtn').style.display = isEdit ? 'inline-block' : 'none';
    displayMyGames(sortMyGames(myGamesCache));
}

function showUpdateModal(gameId) {
    currentUpdateGameId = gameId;
    const game = myGamesCache.find(g => g.game_id == gameId);
    document.getElementById('updateStatus').value = game ? game.status : 'completed';
    document.getElementById('updateScore').value  = game && game.score ? game.score : '';
    // ── Show the game name in the modal subtitle ──
    document.getElementById('updateGameName').textContent = game ? game.name : '';
    document.getElementById('updateMessage').innerHTML = '';
    document.getElementById('updateModal').style.display = 'flex';
    setTimeout(() => {
        const up = document.getElementById('updateScoreUpBtn');
        const dn = document.getElementById('updateScoreDownBtn');
        const inp = document.getElementById('updateScore');
        const clr = document.getElementById('updateScoreClearBtn');
        if (up && dn) {
            up.onclick = () => { if (!inp.value) inp.value=1; else if (parseInt(inp.value)<10) inp.value=parseInt(inp.value)+1; };
            dn.onclick = () => { if (!inp.value) inp.value=1; else if (parseInt(inp.value)>1)  inp.value=parseInt(inp.value)-1; };
        }
        if (clr) {
            clr.onclick = () => { inp.value = ''; };
        }
        // Force integer only — strip any non-digit characters on input
        inp.addEventListener('input', () => {
            const v = inp.value.replace(/[^0-9]/g, '');
            inp.value = v ? Math.min(10, Math.max(1, parseInt(v))) : '';
        });
    }, 0);
}

function closeUpdateModal() {
    document.getElementById('updateModal').style.display = 'none';
    currentUpdateGameId = null;
}

async function confirmUpdate() {
    const status = document.getElementById('updateStatus').value;
    const score  = document.getElementById('updateScore').value;
    const msgDiv = document.getElementById('updateMessage');
    if (score && (score < 1 || score > 10)) { showError(msgDiv, 'Score must be between 1 and 10'); return; }
    try {
        const r = await fetch(`${API_BASE}/user/games/${currentUpdateGameId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ status, score: score ? parseInt(score) : null })
        });
        const d = await r.json();
        if (r.ok) {
            showSuccess(msgDiv, 'Game updated successfully!');
            setTimeout(() => { closeUpdateModal(); loadMyGames(); }, 1500);
        } else {
            showError(msgDiv, d.error || 'Failed to update game');
        }
    } catch { showError(msgDiv, 'Network error. Please try again.'); }
}

function showRemoveModal(gameId, gameName) {
    currentRemoveGameId   = gameId;
    currentRemoveGameName = gameName;
    document.getElementById('removeGameText').textContent = `Are you sure you want to remove "${gameName}" from your list?`;
    document.getElementById('removeMessage').innerHTML = '';
    document.getElementById('removeModal').style.display = 'flex';
}

function closeRemoveModal() {
    document.getElementById('removeModal').style.display = 'none';
    currentRemoveGameId = currentRemoveGameName = null;
}

async function confirmRemove() {
    const msgDiv = document.getElementById('removeMessage');
    try {
        const r = await fetch(`${API_BASE}/user/games/${currentRemoveGameId}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const d = await r.json();
        if (r.ok) {
            showSuccess(msgDiv, `"${currentRemoveGameName}" removed!`);
            setTimeout(() => { closeRemoveModal(); loadMyGames(); }, 1500);
        } else { showError(msgDiv, d.error || 'Failed to remove game'); }
    } catch { showError(msgDiv, 'Network error. Please try again.'); }
}

function closeModal() { document.getElementById('gameModal').style.display = 'none'; }

// ══════════════════════════════════════════════════════════════════════════
// ── CUSTOM LISTS TAB — ACCORDION STYLE ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
function initCustomListsTab() {
    document.getElementById('clNewListBtn').addEventListener('click', () => clOpenListForm(null));

    // List form modal
    document.getElementById('clListFormClose').addEventListener('click', () => clCloseModal('clListFormModal'));
    document.getElementById('clListFormCancel').addEventListener('click', () => clCloseModal('clListFormModal'));
    document.getElementById('clListFormSubmit').addEventListener('click', clSubmitListForm);
    document.getElementById('clListFormModal').addEventListener('click', e => { if (e.target.id === 'clListFormModal') clCloseModal('clListFormModal'); });
    document.getElementById('clListName').addEventListener('input', () => clUpdateCharCount('clListName','clListNameCount',100));
    document.getElementById('clListDesc').addEventListener('input', () => clUpdateCharCount('clListDesc','clListDescCount',500));

    // Delete list modal
    document.getElementById('clDeleteListClose').addEventListener('click', () => clCloseModal('clDeleteListModal'));
    document.getElementById('clDeleteListCancel').addEventListener('click', () => clCloseModal('clDeleteListModal'));
    document.getElementById('clDeleteListConfirm').addEventListener('click', clConfirmDeleteList);
    document.getElementById('clDeleteListModal').addEventListener('click', e => { if (e.target.id === 'clDeleteListModal') clCloseModal('clDeleteListModal'); });

    // Remove game from list modal
    document.getElementById('clRemoveGameClose').addEventListener('click', () => clCloseModal('clRemoveGameModal'));
    document.getElementById('clRemoveGameCancel').addEventListener('click', () => clCloseModal('clRemoveGameModal'));
    document.getElementById('clRemoveGameConfirm').addEventListener('click', clConfirmRemoveGame);
    document.getElementById('clRemoveGameModal').addEventListener('click', e => { if (e.target.id === 'clRemoveGameModal') clCloseModal('clRemoveGameModal'); });

    // ── Edit game in custom list modal ────────────────────────────────────
    document.getElementById('clEditGameCancel').addEventListener('click', () => clCloseEditModal());
    document.getElementById('clEditGameSave').addEventListener('click', clSaveEditGame);
    document.getElementById('clEditGameModal').addEventListener('click', e => {
        if (e.target.id === 'clEditGameModal') clCloseEditModal();
    });
    document.getElementById('clEditScoreUpBtn').addEventListener('click', () => {
        const inp = document.getElementById('clEditScoreInput');
        if (!inp.value) inp.value = 1; else if (parseInt(inp.value) < 10) inp.value = parseInt(inp.value) + 1;
    });
    document.getElementById('clEditScoreDownBtn').addEventListener('click', () => {
        const inp = document.getElementById('clEditScoreInput');
        if (!inp.value) inp.value = 1; else if (parseInt(inp.value) > 1) inp.value = parseInt(inp.value) - 1;
    });

    // Game detail modal close for custom lists
    document.getElementById('clGameModal').addEventListener('click', e => {
        if (e.target.id === 'clGameModal') clCloseModal('clGameModal');
    });
    document.getElementById('clGameModalClose').addEventListener('click', () => clCloseModal('clGameModal'));
}

// ── Open / close helpers for the cl edit game modal ───────────────────────
function clOpenEditModal() {
    document.getElementById('clEditGameModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function clCloseEditModal() {
    document.getElementById('clEditGameModal').style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('clEditGameMessage').innerHTML = '';
}

// ── API helper ────────────────────────────────────────────────────────────
async function clApi(method, path, body) {
    const opts = {
        method,
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(`${API_BASE}${path}`, opts);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
}

// ── Load lists ────────────────────────────────────────────────────────────
async function clLoadLists() {
    try {
        const d = await clApi('GET', '/user/lists');
        clLists = d.lists;
        clRenderAccordion();
    } catch (e) {
        clShowToast(e.message, 'error');
    }
}

// ── Render the accordion list of all custom lists ─────────────────────────
function clRenderAccordion() {
    const container = document.getElementById('clAccordion');
    if (clLists.length === 0) {
        container.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon">📋</div><p>No custom lists yet. Hit <strong>+ New List</strong> to create one.</p></div>`;
        return;
    }
    container.innerHTML = clLists.map(list => clRenderAccordionRow(list)).join('');

    // Wire accordion toggles
    container.querySelectorAll('.cl-acc-header').forEach(header => {
        header.addEventListener('click', e => {
            if (e.target.closest('.btn')) return;
            const listId = parseInt(header.closest('.cl-acc-row').dataset.listId);
            clToggleAccordion(listId);
        });
    });

    // Wire edit/delete list buttons
    container.querySelectorAll('.cl-acc-edit-list-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const list = clLists.find(l => l.id === parseInt(btn.dataset.listId));
            if (list) clOpenListForm(list);
        });
    });
    container.querySelectorAll('.cl-acc-delete-list-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const list = clLists.find(l => l.id === parseInt(btn.dataset.listId));
            if (list) clOpenDeleteModal(list);
        });
    });

    // Re-expand the previously expanded list if any
    if (clExpandedListId) {
        const row = container.querySelector(`.cl-acc-row[data-list-id="${clExpandedListId}"]`);
        if (row) clExpandRow(row, clExpandedListId, false);
    }
}

function clRenderAccordionRow(list) {
    const count = list.game_count || 0;
    const isExpanded = clExpandedListId === list.id;
    return `<div class="cl-acc-row ${isExpanded ? 'expanded' : ''}" data-list-id="${list.id}">
        <div class="cl-acc-header">
            <div class="cl-acc-header-left">
                <span class="cl-acc-chevron">${isExpanded ? '▼' : '▶'}</span>
                <div class="cl-acc-title-group">
                    <div class="cl-acc-title-row">
                        <span class="cl-acc-name">${esc(list.name)}</span>
                        <span class="pill">${count} ${count===1?'game':'games'}</span>
                        <span class="pill ${list.is_public ? 'pill-green' : 'pill-amber'}">${list.is_public ? 'Public' : 'Private'}</span>
                    </div>
                    ${list.description ? `<div class="cl-acc-desc">${esc(list.description)}</div>` : ''}
                </div>
            </div>
            <div class="cl-acc-header-right">
                <button class="btn btn-secondary btn-sm cl-acc-edit-list-btn" data-list-id="${list.id}">Edit List</button>
                <button class="btn btn-danger btn-sm cl-acc-delete-list-btn" data-list-id="${list.id}">Delete</button>
            </div>
        </div>
        <div class="cl-acc-body ${isExpanded ? '' : 'hidden'}" id="cl-acc-body-${list.id}">
            <!-- toolbar injected when expanded -->
        </div>
    </div>`;
}

async function clToggleAccordion(listId) {
    const container = document.getElementById('clAccordion');
    const row = container.querySelector(`.cl-acc-row[data-list-id="${listId}"]`);
    if (!row) return;

    const isCurrentlyExpanded = clExpandedListId === listId;

    // Collapse all rows first
    container.querySelectorAll('.cl-acc-row').forEach(r => {
        r.classList.remove('expanded');
        r.querySelector('.cl-acc-chevron').textContent = '▶';
        r.querySelector('.cl-acc-body').classList.add('hidden');
    });

    if (isCurrentlyExpanded) {
        clExpandedListId = null;
        return;
    }

    // Expand this one
    clExpandedListId = listId;
    clExpandRow(row, listId, true);
}

async function clExpandRow(row, listId, fetch) {
    row.classList.add('expanded');
    row.querySelector('.cl-acc-chevron').textContent = '▼';
    const body = row.querySelector('.cl-acc-body');
    body.classList.remove('hidden');

    // Init filter state for this list if not already set
    if (!clFilters[listId]) {
        clFilters[listId] = { search: '', sort: 'recently_added', status: 'all' };
    }
    if (clIsEditMode[listId] === undefined) clIsEditMode[listId] = false;

    if (fetch || !clListGames[listId]) {
        body.innerHTML = `<div class="coll-empty-state"><div class="coll-empty-icon" style="font-size:1.5rem;">⏳</div><p>Loading…</p></div>`;
        try {
            const d = await clApi('GET', `/user/lists/${listId}`);
            clListGames[listId] = d.list.games || [];
        } catch (e) {
            body.innerHTML = `<div class="coll-empty-state"><p>Failed to load games.</p></div>`;
            return;
        }
    }

    clRenderListBody(listId);
}

// ── Render the body (toolbar + game cards) for an expanded list ────────────
function clRenderListBody(listId) {
    const body = document.getElementById(`cl-acc-body-${listId}`);
    if (!body) return;
    const f = clFilters[listId];
    const editMode = clIsEditMode[listId];

    body.innerHTML = `
        <div class="cl-acc-toolbar">
            <div class="cl-acc-list-header">
                <div class="cl-acc-list-header-inputs">
                    <input type="text" class="search-input cl-acc-search" placeholder="Search games…" value="${esc(f.search)}">
                    <select class="filter-select cl-acc-sort">
                        <option value="recently_added" ${f.sort==='recently_added'?'selected':''}>Recently Added</option>
                        <option value="name"           ${f.sort==='name'?'selected':''}>Name (A-Z)</option>
                        <option value="name_desc"      ${f.sort==='name_desc'?'selected':''}>Name (Z-A)</option>
                        <option value="score_high"     ${f.sort==='score_high'?'selected':''}>Score (High to Low)</option>
                        <option value="score_low"      ${f.sort==='score_low'?'selected':''}>Score (Low to High)</option>
                    </select>
                </div>
                <div class="cl-acc-list-header-btns">
                    <button class="btn btn-secondary btn-sm cl-acc-edit-btn" ${editMode ? 'style="display:none;"' : ''}>Edit</button>
                    <button class="btn btn-success btn-sm cl-acc-done-btn"   ${editMode ? '' : 'style="display:none;"'}>Done</button>
                </div>
            </div>
            <div class="status-tabs cl-acc-status-tabs">
                ${['all','playing','completed','plan_to_play','on_hold','dropped'].map(s =>
                    `<button class="status-tab ${f.status===s?'active':''}" data-status="${s}">${s==='all'?'All Games':STATUS_LABEL[s]}</button>`
                ).join('')}
            </div>
        </div>
        <div class="my-games-list" id="cl-acc-games-${listId}"></div>
    `;

    // Wire toolbar events
    body.querySelector('.cl-acc-search').addEventListener('input', e => {
        clFilters[listId].search = e.target.value.toLowerCase().trim();
        clRenderAccGames(listId);
    });
    body.querySelector('.cl-acc-sort').addEventListener('change', e => {
        clFilters[listId].sort = e.target.value;
        clRenderAccGames(listId);
    });

    // ── Edit / Done toggle inside the list ────────────────────────────────
    body.querySelector('.cl-acc-edit-btn').addEventListener('click', () => {
        clIsEditMode[listId] = true;
        clRenderListBody(listId);
    });
    body.querySelector('.cl-acc-done-btn').addEventListener('click', () => {
        clIsEditMode[listId] = false;
        clRenderListBody(listId);
    });

    body.querySelectorAll('.cl-acc-status-tabs .status-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            clFilters[listId].status = tab.dataset.status;
            body.querySelectorAll('.cl-acc-status-tabs .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            clRenderAccGames(listId);
        });
    });

    clRenderAccGames(listId);
}

// ── Render filtered/sorted game cards inside an expanded list ─────────────
function clRenderAccGames(listId) {
    const container = document.getElementById(`cl-acc-games-${listId}`);
    if (!container) return;
    const f = clFilters[listId];
    const editMode = clIsEditMode[listId];
    let games = [...(clListGames[listId] || [])];

    // Filter by status
    if (f.status !== 'all') games = games.filter(g => g.status === f.status);

    // Filter by search
    if (f.search) {
        games = games.filter(g => g.name.toLowerCase().includes(f.search));
    }

    // Sort
    switch (f.sort) {
        case 'name':           games.sort((a,b) => a.name.localeCompare(b.name)); break;
        case 'name_desc':      games.sort((a,b) => b.name.localeCompare(a.name)); break;
        case 'score_high':     games.sort((a,b) => (b.user_score||0)-(a.user_score||0)); break;
        case 'score_low':      games.sort((a,b) => (a.user_score||0)-(b.user_score||0)); break;
        case 'recently_added':
        default:               games.sort((a,b) => new Date(b.added_at||0)-new Date(a.added_at||0)); break;
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

    container.innerHTML = games.map(g => clRenderGameRow(g, listId, editMode)).join('');

    // Wire row clicks for game details
    container.querySelectorAll('.cl-list-item[data-game-id]').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('.btn') || e.target.closest('.coll-item-edit-actions')) return;
            clShowGameDetails(row.dataset.gameId);
        });
    });

    // Wire edit / remove buttons
    container.querySelectorAll('.cl-edit-game-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            clOpenEditGameModal(btn.dataset.gameId, btn.dataset.listId, btn.dataset.gameName, btn.dataset.score, btn.dataset.status);
        });
    });
    container.querySelectorAll('.cl-remove-game-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            clOpenRemoveGameModal(btn.dataset.gameId, btn.dataset.listId, btn.dataset.gameName);
        });
    });
}

function clRenderGameRow(g, listId, editMode) {
    const score = g.user_score ? g.user_score : '–';
    const statusColor = STATUS_COLOR[g.status] || '#555';
    const statusLabel = STATUS_LABEL[g.status] || (g.status ? g.status : 'No Status');
    const imgSrc = g.background_image || 'https://via.placeholder.com/56x56/1e293b/64748b?text=?';

    const editActions = editMode ? `
        <div class="coll-item-edit-actions">
            <button class="btn btn-secondary btn-sm cl-edit-game-btn"
                data-game-id="${g.game_id}" data-list-id="${listId}"
                data-game-name="${esc(g.name)}"
                data-score="${g.user_score||''}"
                data-status="${g.status||''}">Edit</button>
            <button class="btn btn-danger btn-sm cl-remove-game-btn"
                data-game-id="${g.game_id}" data-list-id="${listId}"
                data-game-name="${esc(g.name)}">Remove</button>
        </div>` : '';

    return `<div class="coll-item cl-list-item" data-game-id="${g.game_id}" data-list-id="${listId}">
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
                ${editActions}
            </div>
        </div>
    </div>`;
}

// ── Show game details modal for custom list games ──────────────────────────
async function clShowGameDetails(gameId) {
    try {
        const response = await fetch(`${API_BASE}/games/${gameId}`);
        const game = await response.json();
        if (!response.ok) return;

        const ratingColor = s => !s ? '#666' : s >= 90 ? '#10b981' : s >= 75 ? '#3b82f6' : s >= 50 ? '#f59e0b' : '#ef4444';
        const heroBg = game.background_image || 'https://via.placeholder.com/860x280/0d1525/3b82f6?text=No+Image';
        const rc = ratingColor(game.metacritic_score);

        const infoItems = [
            game.released ? { label: 'Released', value: new Date(game.released).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) } : null,
            game.publishers?.length ? { label: 'Publisher', value: game.publishers.map(p=>p.name).join(', ') } : null,
            game.developers?.length ? { label: 'Developer', value: game.developers.map(d=>d.name).join(', ') } : null,
            game.platforms?.length  ? { label: 'Platforms',  value: game.platforms.map(p=>p.name).join(' · ') } : null,
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
                            ${game.released ? `<span class="game-detail-date">${new Date(game.released).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</span>` : ''}
                        </div>
                    </div>
                </div>
                ${(game.genres||[]).length ? `<div class="game-detail-genres">${game.genres.map(g=>`<span class="game-detail-genre-tag">${g.name}</span>`).join('')}</div>` : ''}
                ${infoItems.length ? `<div class="game-detail-info-grid">${infoItems.map(i=>`<div class="game-detail-info-item"><div class="game-detail-info-label">${i.label}</div><div class="game-detail-info-value">${i.value}</div></div>`).join('')}</div>` : ''}
                ${game.description ? `<p class="game-detail-desc">${game.description}</p>` : ''}
            </div>`;

        clOpenModal('clGameModal');
    } catch (error) {
        console.error('Show CL game details error:', error);
    }
}

// ── List form modal (create / edit list) ──────────────────────────────────
function clOpenListForm(list) {
    clEditingId = list ? list.id : null;
    document.getElementById('clListFormTitle').textContent  = list ? 'Edit List' : 'Create New List';
    document.getElementById('clListFormSubmit').textContent = list ? 'Save Changes' : 'Create List';
    document.getElementById('clListName').value  = list ? list.name : '';
    document.getElementById('clListDesc').value  = list ? (list.description || '') : '';
    document.getElementById('clListPublic').checked = list ? !!list.is_public : true;
    clUpdateCharCount('clListName', 'clListNameCount', 100);
    clUpdateCharCount('clListDesc', 'clListDescCount', 500);
    clOpenModal('clListFormModal');
    setTimeout(() => document.getElementById('clListName').focus(), 100);
}

async function clSubmitListForm() {
    const name      = document.getElementById('clListName').value.trim();
    const desc      = document.getElementById('clListDesc').value.trim();
    const is_public = document.getElementById('clListPublic').checked;
    if (!name) { clShowToast('Please enter a list name', 'error'); return; }

    const btn = document.getElementById('clListFormSubmit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const body = { name, description: desc || null, cover_color: '#3a7bd5', is_public };
        if (clEditingId) {
            await clApi('PUT', `/user/lists/${clEditingId}`, body);
            clShowToast('List updated!', 'success');
        } else {
            await clApi('POST', '/user/lists', body);
            clShowToast('List created!', 'success');
        }
        clCloseModal('clListFormModal');
        await clLoadLists();
    } catch (e) {
        clShowToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = clEditingId ? 'Save Changes' : 'Create List';
    }
}

// ── Delete list modal ─────────────────────────────────────────────────────
function clOpenDeleteModal(list) {
    _clPendingDeleteId = list.id;
    document.getElementById('clDeleteListName').textContent = list.name;
    clOpenModal('clDeleteListModal');
}

async function clConfirmDeleteList() {
    if (!_clPendingDeleteId) return;
    const btn = document.getElementById('clDeleteListConfirm');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
        await clApi('DELETE', `/user/lists/${_clPendingDeleteId}`);
        clShowToast('List deleted', 'success');
        clCloseModal('clDeleteListModal');
        if (clExpandedListId === _clPendingDeleteId) clExpandedListId = null;
        delete clListGames[_clPendingDeleteId];
        delete clFilters[_clPendingDeleteId];
        delete clIsEditMode[_clPendingDeleteId];
        await clLoadLists();
    } catch (e) {
        clShowToast(e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Delete';
        _clPendingDeleteId = null;
    }
}

// ── Edit game in list modal (status + score) ──────────────────────────────
let _clEditGameId = null;
let _clEditListId = null;

function clOpenEditGameModal(gameId, listId, gameName, existingScore, existingStatus) {
    _clEditGameId = gameId;
    _clEditListId = listId;
    // ── Show the game name in the modal subtitle ──
    document.getElementById('clEditGameName').textContent = gameName || '';
    document.getElementById('clEditScoreInput').value = existingScore || '';
    document.getElementById('clEditGameMessage').innerHTML = '';
    // Set status — fall back to plan_to_play if blank
    const statusSelect = document.getElementById('clEditStatusSelect');
    statusSelect.value = existingStatus || 'plan_to_play';
    clOpenEditModal();
    setTimeout(() => {
        const inp = document.getElementById('clEditScoreInput');
        const clr = document.getElementById('clEditScoreClearBtn');
        inp.focus();
        if (clr) {
            clr.onclick = () => { inp.value = ''; };
        }
        // Force integer only — strip any non-digit characters on input
        inp.addEventListener('input', () => {
            const v = inp.value.replace(/[^0-9]/g, '');
            inp.value = v ? Math.min(10, Math.max(1, parseInt(v))) : '';
        });
    }, 100);
}

async function clSaveEditGame() {
    const scoreVal = document.getElementById('clEditScoreInput').value;
    const score = scoreVal ? parseInt(scoreVal) : null;
    const status = document.getElementById('clEditStatusSelect').value || null;
    const msgDiv = document.getElementById('clEditGameMessage');

    if (scoreVal && (score < 1 || score > 10)) {
        showError(msgDiv, 'Score must be between 1 and 10');
        return;
    }

    const btn = document.getElementById('clEditGameSave');
    btn.disabled = true;

    try {
        await clApi('PUT', `/user/lists/${_clEditListId}/games/${_clEditGameId}`, { score, status });

        // Update local cache
        const games = clListGames[_clEditListId];
        if (games) {
            const game = games.find(g => g.game_id == _clEditGameId);
            if (game) { game.user_score = score; game.status = status; }
        }

        showSuccess(msgDiv, 'Game updated successfully!');
        setTimeout(() => {
            clCloseEditModal();
            clRenderAccGames(_clEditListId);
        }, 1500);
    } catch (e) {
        showError(msgDiv, e.message);
    } finally {
        btn.disabled = false;
    }
}

// ── Remove game from list modal ───────────────────────────────────────────
function clOpenRemoveGameModal(gameId, listId, gameName) {
    clRemoveGameId = gameId;
    _clEditListId = listId;
    document.getElementById('clRemoveGameName').textContent = gameName;
    clOpenModal('clRemoveGameModal');
}

async function clConfirmRemoveGame() {
    const btn = document.getElementById('clRemoveGameConfirm');
    btn.disabled = true;
    try {
        await clApi('DELETE', `/user/lists/${_clEditListId}/games/${clRemoveGameId}`);
        clShowToast('Game removed', 'success');
        clCloseModal('clRemoveGameModal');
        // Remove from local cache and re-render
        if (clListGames[_clEditListId]) {
            clListGames[_clEditListId] = clListGames[_clEditListId].filter(g => g.game_id != clRemoveGameId);
        }
        clRenderAccGames(_clEditListId);
        // Update count in header
        const list = clLists.find(l => l.id == _clEditListId);
        if (list) { list.game_count = Math.max(0, (list.game_count||1) - 1); clRenderAccordion(); }
    } catch (e) {
        clShowToast(e.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ── Modal helpers ─────────────────────────────────────────────────────────
function clOpenModal(id)  { document.getElementById(id).classList.add('open');    document.body.style.overflow = 'hidden'; }
function clCloseModal(id) { document.getElementById(id).classList.remove('open'); document.body.style.overflow = ''; }

function clUpdateCharCount(inputId, countId, max) {
    const len = document.getElementById(inputId).value.length;
    const el  = document.getElementById(countId);
    el.textContent = `${len} / ${max}`;
    el.className   = 'cl-char-count' + (len > max * 0.88 ? ' warn' : '');
}

let _clToastTimer;
function clShowToast(msg, type = '') {
    const el = document.getElementById('clToast');
    el.textContent = msg;
    el.className   = `cl-toast ${type}`;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(_clToastTimer);
    _clToastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════════════════════════
function showError(element, message) {
    if (typeof element === 'string') element = document.getElementById(element);
    element.innerHTML = `<div class="error">${message}</div>`;
}
function showSuccess(element, message) {
    if (typeof element === 'string') element = document.getElementById(element);
    element.innerHTML = `<div class="success">${message}</div>`;
}
function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'home.html';
}
window.logout = logout;