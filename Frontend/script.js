// MyGameList Frontend Script
// Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Global state
let currentUser = null;
let currentPage = 1;
let currentFilters = {};
let currentSort = '-rating';
let isLoading = false;
let selectedGameId = null;
let games = [];

// Utility Functions
function getAuthToken() {
    return localStorage.getItem('authToken');
}

function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

function removeAuthToken() {
    localStorage.removeItem('authToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// API Functions
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Authentication Functions
async function login(username, password) {
    try {
        const response = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        setAuthToken(response.token);
        currentUser = response.user;
        updateAuthUI();
        showNotification('Login successful!', 'success');
        closeModal('loginModal');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

async function register(userData) {
    try {
        const response = await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        setAuthToken(response.token);
        currentUser = response.user;
        updateAuthUI();
        showNotification('Registration successful!', 'success');
        closeModal('registerModal');
        return true;
    } catch (error) {
        showNotification(error.message, 'error');
        return false;
    }
}

function logout() {
    removeAuthToken();
    currentUser = null;
    updateAuthUI();
    showNotification('Logged out successfully', 'info');
    showHome();
}

async function checkAuth() {
    const token = getAuthToken();
    if (!token) return;

    try {
        const response = await apiCall('/auth/me');
        currentUser = response.user;
        updateAuthUI();
    } catch (error) {
        removeAuthToken();
        currentUser = null;
        updateAuthUI();
    }
}

function updateAuthUI() {
    const authButtons = document.getElementById('authButtons');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');

    if (currentUser) {
        authButtons.style.display = 'none';
        userInfo.style.display = 'block';
        userName.textContent = currentUser.display_name || currentUser.username;
    } else {
        authButtons.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

// Game Functions
async function loadGames(page = 1, filters = {}, sort = '-rating') {
    if (isLoading) return;
    
    isLoading = true;
    showLoading();

    try {
        const params = {
            page: page,
            limit: 20,
            ordering: sort
        };

        if (filters.search) params.search = filters.search;
        if (filters.genre) params.genre = filters.genre;

        const query = new URLSearchParams(params).toString();
        const data = await apiCall(`/games?${query}`);
        games = data.games;

        displayGames(games);
        updatePagination(page, data.pagination);
        
    } catch (error) {
        showNotification('Failed to load games. Please try again.', 'error');
        console.error('Load games error:', error);
    } finally {
        isLoading = false;
        hideLoading();
    }
}

async function loadGameDetails(gameId) {
    try {
        showLoading();
        
        const gameData = await apiCall(`/games/${gameId}`);
        let userStatus = null;
        if (currentUser) {
            try {
                const userGames = await apiCall(`/user/games`);
                const userGameEntry = userGames.games.find(g => g.id == gameId);
                if (userGameEntry) {
                    userStatus = {
                        status: userGameEntry.status,
                        score: userGameEntry.score,
                        progress_hours: userGameEntry.progress_hours
                    };
                }
            } catch (error) {
                // User doesn't have this game in list, proceed with null userStatus
            }
        }

        displayGameDetails(gameData, userStatus);
        showModal('gameDetailModal');
        
    } catch (error) {
        showNotification('Failed to load game details', 'error');
        console.error('Load game details error:', error);
    } finally {
        hideLoading();
    }
}

async function addToUserList(gameId, status, score = null, hours = null) {
    if (!currentUser) {
        showNotification('Please login first', 'warning');
        return;
    }

    try {
        const data = { status };
        if (score !== null && score !== '') data.score = parseFloat(score);
        if (hours !== null && hours !== '') data.progress_hours = parseFloat(hours);

        await apiCall(`/user/games/${gameId}`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showNotification('Game added to your list!', 'success');
        closeModal('addToListModal');
        
        if (selectedGameId) {
            loadGameDetails(selectedGameId);
        }
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function removeFromUserList(gameId) {
    if (!currentUser) return;

    try {
        await apiCall(`/user/games/${gameId}`, {
            method: 'DELETE'
        });

        showNotification('Game removed from your list', 'info');
        
        if (selectedGameId) {
            loadGameDetails(selectedGameId);
        }
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function loadUserGames(status = '') {
    if (!currentUser) {
        showNotification('Please login first', 'warning');
        return;
    }

    try {
        showLoading();
        const params = status ? `?status=${status}` : '';
        const data = await apiCall(`/user/games${params}`);
        
        displayUserGames(data.games);
        document.getElementById('sectionTitle').textContent = `My Games${status ? ` - ${status.replace('_', ' ').toUpperCase()}` : ''}`;
        
    } catch (error) {
        showNotification('Failed to load your games', 'error');
        console.error('Load user games error:', error);
    } finally {
        hideLoading();
    }
}

// Display Functions
function displayGames(games) {
    const grid = document.getElementById('gamesGrid');
    grid.innerHTML = '';

    games.forEach(game => {
        const gameCard = createGameCard(game);
        grid.appendChild(gameCard);
    });
}

function displayUserGames(userGames) {
    const grid = document.getElementById('gamesGrid');
    grid.innerHTML = '';

    userGames.forEach(userGame => {
        const gameCard = createUserGameCard(userGame);
        grid.appendChild(gameCard);
    });
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => loadGameDetails(game.id);

    const genres = game.genres ? game.genres.slice(0, 3).map(g => g.name).join(', ') : '';
    
    card.innerHTML = `
        <div class="game-image" style="background-image: url('${game.background_image || ''}')">
            <div class="game-rating">${game.rating || 'N/A'}</div>
        </div>
        <div class="game-info">
            <div class="game-title">${game.name}</div>
            <div class="game-meta">Genres: ${genres}</div>
            <div class="game-actions">
                <button class="btn-small btn-add" onclick="event.stopPropagation(); showAddToList(${game.id})">
                    Add to List
                </button>
                <button class="btn-small btn-info" onclick="event.stopPropagation(); loadGameDetails(${game.id})">
                    Details
                </button>
            </div>
        </div>
    `;

    return card;
}

function createUserGameCard(userGame) {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    const statusColors = {
        'playing': '#27ae60',
        'completed': '#3498db',
        'on_hold': '#f39c12',
        'dropped': '#e74c3c',
        'plan_to_play': '#95a5a6'
    };

    card.innerHTML = `
        <div class="game-image" style="background-image: url('${userGame.background_image || ''}')">
            <div class="game-rating">${userGame.rating || 'N/A'}</div>
        </div>
        <div class="game-info">
            <div class="game-title">${userGame.name}</div>
            <div class="game-meta" style="color: ${statusColors[userGame.status]}; font-weight: bold;">
                ${userGame.status.replace('_', ' ').toUpperCase()}
            </div>
            ${userGame.score ? `<div class="game-meta">Your Score: ${userGame.score}/10</div>` : ''}
            ${userGame.progress_hours ? `<div class="game-meta">Hours: ${userGame.progress_hours}</div>` : ''}
            <div class="game-actions">
                <button class="btn-small btn-info" onclick="showAddToList(${userGame.id}, true)">
                    Edit
                </button>
                <button class="btn-small" style="background: #e74c3c; color: white;" onclick="removeFromUserList(${userGame.id})">
                    Remove
                </button>
            </div>
        </div>
    `;

    return card;
}

function displayGameDetails(game, userStatus) {
    const content = document.getElementById('gameDetailContent');
    
    const userStatusHTML = userStatus ? `
        <div style="background: #27ae60; color: white; padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem;">
            <strong>In your list:</strong> ${userStatus.status.replace('_', ' ').toUpperCase()}
            ${userStatus.score ? ` | Score: ${userStatus.score}/10` : ''}
        </div>
    ` : '';

    content.innerHTML = `
        <h2>${game.name}</h2>
        ${userStatusHTML}
        
        <div style="display: grid; grid-template-columns: 1fr 300px; gap: 2rem; margin: 1rem 0;">
            <div>
                <img src="${game.background_image || ''}" alt="${game.name}" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px;">
                
                <div style="margin: 1rem 0;">
                    <h3>Description</h3>
                    <div>${game.description || 'No description available.'}</div>
                </div>
            </div>
            
            <div>
                <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <h3>Game Info</h3>
                    <p><strong>Rating:</strong> ${game.rating || 'N/A'}/5</p>
                </div>

                ${game.genres && game.genres.length > 0 ? `
                    <div style="margin-bottom: 1rem;">
                        <h4>Genres</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                            ${game.genres.map(genre => 
                                `<span class="genre-tag">${genre.name}</span>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}

                <div style="margin-top: 1rem;">
                    ${currentUser ? `
                        ${userStatus ? `
                            <button class="btn btn-primary" onclick="showAddToList(${game.id}, true)" style="width: 100%; margin-bottom: 0.5rem;">
                                Edit Status
                            </button>
                            <button class="btn btn-secondary" onclick="removeFromUserList(${game.id})" style="width: 100%;">
                                Remove from List
                            </button>
                        ` : `
                            <button class="btn btn-primary" onclick="showAddToList(${game.id})" style="width: 100%;">
                                Add to List
                            </button>
                        `}
                    ` : `
                        <p style="text-align: center; color: #666;">Login to add to your list</p>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Filter and Search Functions
async function loadFilters() {
    try {
        const genresData = await apiCall('/genres');
        const genreSelect = document.getElementById('genreFilter');
        genreSelect.innerHTML = '<option value="">All Genres</option>';
        
        genresData.genres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.slug; // Backend uses slug for filtering
            option.textContent = genre.name;
            genreSelect.appendChild(option);
        });

    } catch (error) {
        showNotification('Failed to load filters', 'error');
        console.error('Failed to load filters:', error);
    }
}

function searchGames() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
        showNotification('Please enter a search term', 'warning');
        return;
    }
    
    currentFilters.search = searchTerm;
    currentPage = 1;
    loadGames(currentPage, currentFilters, currentSort);
}

function applyFilters() {
    const genreFilter = document.getElementById('genreFilter').value;

    currentFilters = {};
    
    if (genreFilter) currentFilters.genre = genreFilter;

    currentPage = 1;
    loadGames(currentPage, currentFilters, currentSort);
}

function clearFilters() {
    document.getElementById('genreFilter').value = '';
    document.getElementById('searchInput').value = '';

    currentFilters = {};
    currentPage = 1;
    loadGames(currentPage, currentFilters, currentSort);
}

function sortGames() {
    const sortSelect = document.getElementById('sortSelect');
    currentSort = sortSelect.value;
    currentPage = 1;
    loadGames(currentPage, currentFilters, currentSort);
}

// Pagination Functions
function updatePagination(page, pagination) {
    const paginationEl = document.getElementById('pagination');
    paginationEl.innerHTML = '';

    const hasPrevious = page > 1;
    const hasNext = pagination && pagination.page * pagination.limit < 1000; // Arbitrary limit, adjust based on backend

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.disabled = !hasPrevious;
    prevButton.onclick = () => {
        if (hasPrevious) {
            currentPage = page - 1;
            loadGames(currentPage, currentFilters, currentSort);
        }
    };
    paginationEl.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `Page ${page}`;
    pageInfo.className = 'current-page';
    paginationEl.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.disabled = !hasNext;
    nextButton.onclick = () => {
        if (hasNext) {
            currentPage = page + 1;
            loadGames(currentPage, currentFilters, currentSort);
        }
    };
    paginationEl.appendChild(nextButton);
}

// Modal Functions
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showLogin() {
    showModal('loginModal');
}

function showRegister() {
    showModal('registerModal');
}

function showAddToList(gameId, isEdit = false) {
    if (!currentUser) {
        showNotification('Please login first', 'warning');
        return;
    }
    
    selectedGameId = gameId;
    
    document.getElementById('gameStatus').value = 'plan_to_play';
    document.getElementById('gameScore').value = '';
    document.getElementById('gameHours').value = '';
    
    const modalTitle = document.querySelector('#addToListModal h2');
    const submitButton = document.querySelector('#addToListModal button[type="submit"]');
    
    if (isEdit) {
        modalTitle.textContent = 'Edit Game Status';
        submitButton.textContent = 'Update';
    } else {
        modalTitle.textContent = 'Add to List';
        submitButton.textContent = 'Add to List';
    }
    
    showModal('addToListModal');
}

// Navigation Functions
function showHome() {
    document.getElementById('sectionTitle').textContent = 'Discover Games';
    currentPage = 1;
    loadGames(currentPage, currentFilters, currentSort);
}

function showMyList() {
    if (!currentUser) {
        showNotification('Please login first', 'warning');
        return;
    }
    loadUserGames();
}

async function showStats() {
    try {
        const stats = await apiCall('/stats');
        showNotification(`Platform Stats: ${stats.stats.total_games} games, ${stats.stats.total_users} users`, 'info');
    } catch (error) {
        showNotification('Failed to load stats', 'error');
    }
}

// UI Helper Functions
function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('gamesGrid').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('gamesGrid').style.display = 'grid';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 4px;
        color: white;
        font-weight: 500;
        z-index: 1001;
        max-width: 300px;
        word-wrap: break-word;
    `;

    const colors = {
        success: '#27ae60',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 4000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadGames();
    loadFilters();

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        await login(username, password);
    });

    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const userData = {
            username: document.getElementById('registerUsername').value,
            email: document.getElementById('registerEmail').value,
            display_name: document.getElementById('registerDisplayName').value,
            password: document.getElementById('registerPassword').value
        };
        await register(userData);
    });

    document.getElementById('addToListForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const status = document.getElementById('gameStatus').value;
        const score = document.getElementById('gameScore').value;
        const hours = document.getElementById('gameHours').value;
        await addToUserList(selectedGameId, status, score, hours);
    });

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(searchGames, 500);
    });

    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            searchGames();
        }
    });

    window.addEventListener('click', function(e) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('MyGameList initialized');
});