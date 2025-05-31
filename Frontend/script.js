class GameListApp {
    constructor() {
        this.API_BASE = 'http://localhost:3000/api';
        this.currentUser = null;
        this.authToken = null;
        this.currentView = 'search';
        this.currentUpdateGameId = null;
        this.authData = {}; // Store auth data in memory
        this.isEditMode = false;
        this.currentDeleteGameId = null;
        this.currentRemoveGameId = null; // Add this line
        this.currentRemoveGameName = null; // Add this line
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthToken();
    }

    bindEvents() {
        // Auth events
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Navigation events
        document.getElementById('myGamesBtn').addEventListener('click', () => this.showMyGames());
        document.getElementById('backToSearchBtn').addEventListener('click', () => this.showSearch());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // Edit mode events
        document.getElementById('editListBtn').addEventListener('click', () => this.toggleEditMode(true));
        document.getElementById('doneEditingBtn').addEventListener('click', () => this.toggleEditMode(false));
        
        // Search events
        document.getElementById('searchBtn').addEventListener('click', () => this.searchGames());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchGames();
        });
        
        // Modal events
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('gameModal').addEventListener('click', (e) => {
            if (e.target.id === 'gameModal') this.closeModal();
        });

        // Update modal events
        document.getElementById('confirmUpdateBtn').addEventListener('click', () => this.confirmUpdate());
        document.getElementById('cancelUpdateBtn').addEventListener('click', () => this.closeUpdateModal());
        document.getElementById('updateModal').addEventListener('click', (e) => {
            if (e.target.id === 'updateModal') this.closeUpdateModal();
        });
        
        // Remove modal events
        document.getElementById('confirmRemoveBtn').addEventListener('click', () => this.confirmRemove());
        document.getElementById('cancelRemoveBtn').addEventListener('click', () => this.closeRemoveModal());
        document.getElementById('removeModal').addEventListener('click', (e) => {
            if (e.target.id === 'removeModal') this.closeRemoveModal();
        });

        // Update the delegated events section (replace the existing delete button logic)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-to-list-btn')) {
                const gameId = e.target.dataset.gameId;
                this.addToList(gameId);
            } else if (e.target.classList.contains('update-btn')) {
                const gameId = e.target.dataset.gameId;
                this.showUpdateModal(gameId);
            } else if (e.target.classList.contains('delete-btn')) {
                const gameId = e.target.dataset.gameId;
                const gameName = e.target.dataset.gameName;
                this.showRemoveModal(gameId, gameName);
            }
        });
    }

    checkAuthToken() {
        // Check if we have stored auth data in memory
        if (this.authData.token) {
            this.authToken = this.authData.token;
            this.verifyToken();
        }
    }

    switchTab(tab) {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const tabs = document.querySelectorAll('.tab-btn');

        tabs.forEach(t => t.classList.remove('active'));
        
        if (tab === 'login') {
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            tabs[0].classList.add('active');
        } else {
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
            tabs[1].classList.add('active');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch(`${this.API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.currentUser = data.user;
                this.authData = { token: data.token, user: data.user }; // Store in memory
                this.showMainApp();
            } else {
                this.showError(errorDiv, data.error);
            }
        } catch (error) {
            this.showError(errorDiv, 'Network error. Please try again.');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const display_name = document.getElementById('regDisplayName').value;
        const password = document.getElementById('regPassword').value;
        const errorDiv = document.getElementById('registerError');

        try {
            const response = await fetch(`${this.API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, display_name, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.currentUser = data.user;
                this.authData = { token: data.token, user: data.user }; // Store in memory
                this.showMainApp();
            } else {
                this.showError(errorDiv, data.error);
            }
        } catch (error) {
            this.showError(errorDiv, 'Network error. Please try again.');
        }
    }

    async verifyToken() {
        try {
            const response = await fetch(`${this.API_BASE}/auth/me`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.showMainApp();
            } else {
                this.clearAuth();
            }
        } catch (error) {
            this.clearAuth();
        }
    }

    showMainApp() {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('searchSection').classList.remove('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('myGamesBtn').style.display = 'inline-block'; // Ensure My Games button is visible
        document.getElementById('backToSearchBtn').style.display = 'none'; // Ensure Back to Search is hidden
        document.getElementById('welcomeText').textContent = `Welcome, ${this.currentUser.display_name}!`;
        this.currentView = 'search';
    }

    showSearch() {
        document.getElementById('myGamesSection').classList.add('hidden');
        document.getElementById('searchSection').classList.remove('hidden');
        document.getElementById('backToSearchBtn').style.display = 'none';
        document.getElementById('myGamesBtn').style.display = 'inline-block'; // Show My Games button
        this.currentView = 'search';
    }

    showMyGames() {
        document.getElementById('searchSection').classList.add('hidden');
        document.getElementById('myGamesSection').classList.remove('hidden');
        document.getElementById('backToSearchBtn').style.display = 'inline-block';
        document.getElementById('myGamesBtn').style.display = 'none'; // Hide My Games button
        this.currentView = 'myGames';
        this.loadMyGames();
    }

    toggleEditMode(isEdit) {
        this.isEditMode = isEdit;
        document.getElementById('editListBtn').style.display = isEdit ? 'none' : 'inline-block';
        document.getElementById('doneEditingBtn').style.display = isEdit ? 'inline-block' : 'none';
        this.loadMyGames(); // Refresh the list to show/hide edit buttons
    }

    logout() {
        this.clearAuth();
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('searchSection').classList.add('hidden');
        document.getElementById('myGamesSection').classList.add('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('backToSearchBtn').style.display = 'none';
    }

    clearAuth() {
        this.authData = {}; // Clear memory storage
        this.authToken = null;
        this.currentUser = null;
    }

    async searchGames() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        if (!searchTerm) return;

        try {
            const response = await fetch(`${this.API_BASE}/games?search=${encodeURIComponent(searchTerm)}`);
            const data = await response.json();

            if (response.ok) {
                this.displaySearchResults(data.games);
            } else {
                console.error('Search failed:', data.error);
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    async loadMyGames() {
        try {
            const response = await fetch(`${this.API_BASE}/user/games`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();
            
            if (response.ok) {
                this.displayMyGames(data.games);
            } else {
                console.error('Failed to fetch games:', data.error);
            }
        } catch (error) {
            console.error('Error fetching games:', error);
        }
    }

    displaySearchResults(games) {
        const container = document.getElementById('searchResults');
        
        if (games.length === 0) {
            container.innerHTML = '<div class="empty-state">No games found.</div>';
            return;
        }

        container.innerHTML = games.map(game => `
            <div class="game-card" data-game-id="${game.id}">
                <img src="${game.background_image || 'https://via.placeholder.com/300x200?text=No+Image'}" 
                     alt="${game.name}" class="game-image" 
                     onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
                <div class="game-info">
                    <div class="game-title">${game.name}</div>
                    <div>
                        <span class="game-rating">⭐ ${game.rating || 'N/A'}</span>
                    </div>
                    <div class="game-genres">
                        ${(game.genres || []).map(genre => `<span class="genre-tag">${genre.name}</span>`).join('')}
                    </div>
                    ${game.description ? `<p style="color: #666; font-size: 14px; margin-top: 8px;">${game.description.substring(0, 80)}...</p>` : ''}
                </div>
            </div>
        `).join('');

        // Add click events to game cards
        container.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => {
                const gameId = card.dataset.gameId;
                this.showGameDetails(gameId);
            });
        });
    }

    // Update the displayMyGames method to remove inline confirmation and add game name to dataset
    displayMyGames(games) {
        const container = document.getElementById('myGamesGrid');
        
        if (games.length === 0) {
            container.innerHTML = '<div class="empty-state">Your game list is empty. Search and add some games!</div>';
            return;
        }

        if (this.isEditMode) {
            // Edit mode view with update/remove buttons
            container.innerHTML = games.map(game => `
                <div class="list-item" data-game-id="${game.id}">
                    <div class="game-name">${game.name}</div>
                    <div class="game-score-display">${game.score ? `${game.score}/10` : 'No Score'}</div>
                    <div class="list-actions">
                        <button class="btn small update-btn" data-game-id="${game.id}">Update</button>
                        <button class="btn small danger delete-btn" data-game-id="${game.id}" data-game-name="${game.name}">Remove</button>
                    </div>
                </div>
            `).join('');
        } else {
            // Normal view without edit buttons
            container.innerHTML = games.map(game => `
                <div class="list-item" data-game-id="${game.id}">
                    <div class="game-name">${game.name}</div>
                    <div class="game-score-display">${game.score ? `${game.score}/10` : 'No Score'}</div>
                </div>
            `).join('');
        }
    }

    async showGameDetails(gameId) {
        try {
            const response = await fetch(`${this.API_BASE}/games/${gameId}`);
            const game = await response.json();

            if (response.ok) {
                document.getElementById('gameDetails').innerHTML = `
                    <img src="${game.background_image || 'https://via.placeholder.com/700x250?text=No+Image'}" 
                         alt="${game.name}" class="detail-image" 
                         onerror="this.src='https://via.placeholder.com/700x250?text=No+Image'">
                    <h2>${game.name}</h2>
                    <div style="margin: 15px 0;">
                        <span class="game-rating">⭐ ${game.rating || 'N/A'}</span>
                        ${game.metacritic_score ? `<span class="game-rating" style="background: linear-gradient(45deg, #27ae60, #2ecc71);">🎯 ${game.metacritic_score}</span>` : ''}
                    </div>
                    <div class="game-genres" style="margin: 15px 0;">
                        ${(game.genres || []).map(genre => `<span class="genre-tag">${genre.name}</span>`).join('')}
                    </div>
                    <p><strong>Released:</strong> ${game.released || 'Unknown'}</p>
                    <p><strong>Playtime:</strong> ${game.playtime || 0} hours</p>
                    ${game.publishers && game.publishers.length > 0 ? `<p><strong>Publishers:</strong> ${game.publishers.map(p => p.name).join(', ')}</p>` : ''}
                    ${game.developers && game.developers.length > 0 ? `<p><strong>Developers:</strong> ${game.developers.map(d => d.name).join(', ')}</p>` : ''}
                    ${game.platforms && game.platforms.length > 0 ? `<p><strong>Platforms:</strong> ${game.platforms.map(p => p.name).join(', ')}</p>` : ''}
                    <p style="margin: 15px 0; line-height: 1.6;">${game.description || 'No description available'}</p>
                    <div class="add-to-list">
                        <h3>Add to My List</h3>
                        <div style="margin: 15px 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <label>Score (1-10):</label>
                            <input type="number" id="gameScore" class="score-input" min="1" max="10" placeholder="Score">
                            <button class="btn add-to-list-btn" data-game-id="${game.id}">Add to List</button>
                        </div>
                        <div id="addGameMessage"></div>
                    </div>
                `;
                document.getElementById('gameModal').style.display = 'block';
            }
        } catch (error) {
            console.error('Error fetching game details:', error);
        }
    }

    closeModal() {
        document.getElementById('gameModal').style.display = 'none';
    }

    showUpdateModal(gameId) {
        this.currentUpdateGameId = gameId;
        document.getElementById('updateScore').value = '';
        document.getElementById('updateMessage').innerHTML = '';
        document.getElementById('updateModal').style.display = 'block';
    }

    closeUpdateModal() {
        document.getElementById('updateModal').style.display = 'none';
        this.currentUpdateGameId = null;
    }

    // Add these new methods for remove modal functionality
    showRemoveModal(gameId, gameName) {
        this.currentRemoveGameId = gameId;
        this.currentRemoveGameName = gameName;
        document.getElementById('removeGameText').textContent = `Are you sure you want to remove "${gameName}" from your list?`;
        document.getElementById('removeMessage').innerHTML = '';
        document.getElementById('removeModal').style.display = 'block';
    }

    closeRemoveModal() {
        document.getElementById('removeModal').style.display = 'none';
        this.currentRemoveGameId = null;
        this.currentRemoveGameName = null;
    }

    async confirmRemove() {
        const messageDiv = document.getElementById('removeMessage');

        try {
            const response = await fetch(`${this.API_BASE}/user/games/${this.currentRemoveGameId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(messageDiv, `"${this.currentRemoveGameName}" removed successfully!`);
                setTimeout(() => {
                    this.closeRemoveModal();
                    this.loadMyGames(); // Refresh the list
                }, 1500);
            } else {
                this.showError(messageDiv, data.error || 'Failed to remove game');
            }
        } catch (error) {
            this.showError(messageDiv, 'Network error. Please try again.');
        }
    }

    async confirmUpdate() {
        const score = document.getElementById('updateScore').value;
        const messageDiv = document.getElementById('updateMessage');

        if (!score || score < 1 || score > 10) {
            this.showError(messageDiv, 'Please enter a valid score between 1 and 10');
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE}/user/games/${this.currentUpdateGameId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    status: 'completed', // Keep existing status or make it dynamic
                    score: parseInt(score),
                    progress_hours: null // Include if you want to update this too
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(messageDiv, 'Score updated successfully!');
                setTimeout(() => {
                    this.closeUpdateModal();
                    this.loadMyGames(); // Refresh the list
                }, 1500);
            } else {
                this.showError(messageDiv, data.error || 'Failed to update score');
            }
        } catch (error) {
            this.showError(messageDiv, 'Network error. Please try again.');
        }
    }

    async addToList(gameId) {
        const score = document.getElementById('gameScore').value;
        const messageDiv = document.getElementById('addGameMessage');

        try {
            const response = await fetch(`${this.API_BASE}/user/games/${gameId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    status: 'completed',
                    score: score ? parseInt(score) : null
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(messageDiv, 'Game added to your list successfully!');
                // Refresh the current view if we're in my games
                if (this.currentView === 'myGames') {
                    setTimeout(() => this.loadMyGames(), 1000);
                }
            } else {
                this.showError(messageDiv, data.error);
            }
        } catch (error) {
            this.showError(messageDiv, 'Network error. Please try again.');
        }
    }

    async deleteFromList(gameId) {
        if (!gameId) return;

        try {
            const response = await fetch(`${this.API_BASE}/user/games/${gameId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.hideDeleteConfirmation();
                this.loadMyGames(); // Refresh the list
            } else {
                alert('Error removing game: ' + data.error);
            }
        } catch (error) {
            alert('Network error. Please try again.');
        }
    }

    showError(element, message) {
        element.textContent = message;
        element.classList.remove('hidden', 'success');
        element.classList.add('error');
    }

    showSuccess(element, message) {
        element.textContent = message;
        element.classList.remove('hidden', 'error');
        element.classList.add('success');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameListApp();
});