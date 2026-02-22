class GameListApp {
    constructor() {
        this.API_BASE = 'http://localhost:3000/api';
        this.currentUser = null;
        this.authToken = null;
        this.currentView = 'search';
        this.currentUpdateGameId = null;
        this.authData = {};
        this.isEditMode = false;
        this.currentRemoveGameId = null;
        this.currentRemoveGameName = null;
        this.currentSearchResults = [];
        this.currentFilters = {};
        this.allGames = [];
        this.currentSort = 'rating';
        this.currentPage = 1;
        this.gamesPerPage = 21; 
        this.nextPageGames = 21; 
        this.totalPages = 0; 
        this.isLoading = false;
        this.hasMoreGames = true;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // New properties for My Games sorting
        this.currentMyGamesSort = 'recently_added';
        this.myGamesCache = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthToken();
        this.setupInfiniteScroll();
    }

    setupInfiniteScroll() {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) {
            console.error('searchResults container not found');
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !this.isLoading && this.hasMoreGames) {
                    this.fetchGames(false);
                }
            },
            {
                root: searchResults,
                threshold: 0.1
            }
        );

        const sentinel = document.getElementById('sentinel');
        if (sentinel) observer.observe(sentinel);
    }

    bindEvents() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        if (registerForm) registerForm.addEventListener('submit', (e) => this.handleRegister(e));

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        const myGamesBtn = document.getElementById('myGamesBtn');
        const backToSearchBtn = document.getElementById('backToSearchBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        if (myGamesBtn) myGamesBtn.addEventListener('click', () => this.showMyGames());
        if (backToSearchBtn) backToSearchBtn.addEventListener('click', () => this.showSearch());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        const editListBtn = document.getElementById('editListBtn');
        const doneEditingBtn = document.getElementById('doneEditingBtn');
        if (editListBtn) editListBtn.addEventListener('click', () => this.toggleEditMode(true));
        if (doneEditingBtn) doneEditingBtn.addEventListener('click', () => this.toggleEditMode(false));

        const searchBtn = document.getElementById('searchBtn');
        const searchInput = document.getElementById('searchInput');
        const sortBySelect = document.getElementById('sortBy');
        if (searchBtn) searchBtn.addEventListener('click', () => this.searchGames());
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchGames();
            });
        }
        if (sortBySelect) {
            sortBySelect.value = 'rating';
            sortBySelect.addEventListener('change', () => {
                this.currentSort = sortBySelect.value;
                this.currentPage = 1;
                this.allGames = [];
                this.hasMoreGames = true;
                this.retryCount = 0;
                window.scrollTo(0, 0);
                this.fetchGames(true);
            });
        }

        // My Games sort dropdown
        const myGamesSortSelect = document.getElementById('myGamesSort');
        if (myGamesSortSelect) {
            myGamesSortSelect.value = 'recently_added';
            myGamesSortSelect.addEventListener('change', () => {
                this.currentMyGamesSort = myGamesSortSelect.value;
                this.loadMyGames();
            });
        }

        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => this.toggleFilterSection());
        }

        const applyFiltersBtn = document.getElementById('applyFiltersBtn');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => this.applyFilters());
        }

        const resetFiltersBtn = document.getElementById('resetFiltersBtn');
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => this.resetFilters());
        }

        const closeModalBtn = document.getElementById('closeModalBtn');
        const gameModal = document.getElementById('gameModal');
        if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeModal());
        if (gameModal) {
            gameModal.addEventListener('click', (e) => {
                if (e.target.id === 'gameModal') this.closeModal();
            });
        }

        const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');
        const cancelUpdateBtn = document.getElementById('cancelUpdateBtn');
        const updateModal = document.getElementById('updateModal');
        if (confirmUpdateBtn) confirmUpdateBtn.addEventListener('click', () => this.confirmUpdate());
        if (cancelUpdateBtn) cancelUpdateBtn.addEventListener('click', () => this.closeUpdateModal());
        if (updateModal) {
            updateModal.addEventListener('click', (e) => {
                if (e.target.id === 'updateModal') this.closeUpdateModal();
            });
        }

        const confirmRemoveBtn = document.getElementById('confirmRemoveBtn');
        const cancelRemoveBtn = document.getElementById('cancelRemoveBtn');
        const removeModal = document.getElementById('removeModal');
        if (confirmRemoveBtn) confirmRemoveBtn.addEventListener('click', () => this.confirmRemove());
        if (cancelRemoveBtn) cancelRemoveBtn.addEventListener('click', () => this.closeRemoveModal());
        if (removeModal) {
            removeModal.addEventListener('click', (e) => {
                if (e.target.id === 'removeModal') this.closeRemoveModal();
            });
        }

        // Bind events for both top and bottom pagination buttons
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const topPrevPageBtn = document.getElementById('topPrevPageBtn');
        const topNextPageBtn = document.getElementById('topNextPageBtn');
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => this.goToPreviousPage());
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => this.goToNextPage());
        if (topPrevPageBtn) topPrevPageBtn.addEventListener('click', () => this.goToPreviousPage());
        if (topNextPageBtn) topNextPageBtn.addEventListener('click', () => this.goToNextPage());

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
            } else if (e.target.classList.contains('game-card')) {
                const gameId = e.target.dataset.gameId;
                this.showGameDetails(gameId, false); // false = from search
            } else if (e.target.closest('.game-card')) {
                const gameCard = e.target.closest('.game-card');
                if (e.target.classList.contains('btn')) {
                    return;
                } else {
                    const gameId = gameCard.dataset.gameId;
                    this.showGameDetails(gameId, false); // false = from search
                }
            } else if (e.target.closest('.list-item')) {
                const listItem = e.target.closest('.list-item');
                if (e.target.classList.contains('update-btn') || 
                    e.target.classList.contains('delete-btn') ||
                    e.target.classList.contains('btn')) {
                    return;
                } else {
                    const gameId = listItem.dataset.gameId;
                    this.showGameDetails(gameId, true); // true = from My Games
                }
            }
        });
    }

    goToPreviousPage() {
        if (this.currentPage <= 1 || this.isLoading) return;
        this.currentPage--;
        this.allGames = [];
        this.hasMoreGames = true;
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    goToNextPage() {
        if (!this.hasMoreGames || this.isLoading) return;
        this.currentPage++;
        this.allGames = [];
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    updatePaginationButtons() {
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const topPrevPageBtn = document.getElementById('topPrevPageBtn');
        const topNextPageBtn = document.getElementById('topNextPageBtn');
        const pageInfo = document.getElementById('pageInfo');
        const bottomPageInfo = document.getElementById('bottomPageInfo');

        if (prevPageBtn) prevPageBtn.disabled = this.currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = !this.hasMoreGames;
        if (topPrevPageBtn) topPrevPageBtn.disabled = this.currentPage <= 1;
        if (topNextPageBtn) topNextPageBtn.disabled = !this.hasMoreGames;

        const pageText = this.totalPages > 0 
            ? `Page ${this.currentPage} of ${this.totalPages}`
            : `Page ${this.currentPage}`;
        if (pageInfo) pageInfo.textContent = pageText;
        if (bottomPageInfo) bottomPageInfo.textContent = pageText;
    }

    checkAuthToken() {
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
                this.authData = { token: data.token, user: data.user };
                this.showMainApp();
            } else {
                this.showError(errorDiv, data.error);
            }
        } catch (error) {
            console.error('Login error:', error);
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
                this.authData = { token: data.token, user: data.user };
                this.showMainApp();
            } else {
                this.showError(errorDiv, data.error);
            }
        } catch (error) {
            console.error('Register error:', error);
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
            console.error('Verify token error:', error);
            this.clearAuth();
        }
    }

    async fetchGames(replace = true) {
        if (this.isLoading || (!replace && !this.hasMoreGames)) return;
        this.isLoading = true;

        try {
            const limit = this.currentPage === 1 ? this.gamesPerPage : this.nextPageGames;
            const offset = (this.currentPage - 1) * this.nextPageGames + (this.currentPage === 1 ? 0 : this.gamesPerPage - this.nextPageGames);
            const queryParams = new URLSearchParams({
                offset,
                limit,
                sort: this.currentSort,
                ...this.currentFilters
            });
            console.log('Fetching games with params:', queryParams.toString());
            const response = await fetch(`${this.API_BASE}/games?${queryParams.toString()}`);
            const data = await response.json();
            console.log('Fetch response:', { games: data.games.length, total: data.total, hasMore: data.hasMore });

            if (response.ok) {
                this.retryCount = 0;
                this.allGames = replace ? data.games : [...this.allGames, ...data.games];
                this.hasMoreGames = data.hasMore;
                if (data.total) {
                    const totalGames = data.total;
                    const firstPageGames = this.gamesPerPage;
                    const subsequentGamesPerPage = this.nextPageGames;
                    const remainingGames = Math.max(0, totalGames - firstPageGames);
                    this.totalPages = 1 + Math.ceil(remainingGames / subsequentGamesPerPage);
                } else {
                    this.totalPages = 0;
                }
                this.currentPage = replace ? this.currentPage : this.currentPage + 1;
                this.populateFilterOptions();
                this.displaySearchResults(data.games, replace);
                this.updatePaginationButtons();
                if (this.allGames.length === 0 && replace) {
                    document.getElementById('searchResults').innerHTML = '<div class="empty-state">No games found.</div>';
                } else if (!this.hasMoreGames && !replace) {
                    document.getElementById('searchResults').insertAdjacentHTML('beforeend', '<div class="no-more">No more games to load.</div>');
                }
            } else if (response.status === 429 && this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Rate limit reached, retrying (${this.retryCount}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
                return this.fetchGames(replace);
            } else {
                this.showError(document.getElementById('searchResults'), `Failed to fetch games: ${data.error || 'Unknown error'}`);
                this.hasMoreGames = false;
            }
        } catch (error) {
            console.error('Fetch error:', error);
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Fetch failed, retrying (${this.retryCount}/${this.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
                return this.fetchGames(replace);
            } else {
                this.showError(document.getElementById('searchResults'), 'Network error. Please try again.');
                this.hasMoreGames = false;
            }
        } finally {
            this.isLoading = false;
        }
    }

    showMainApp() {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('searchSection').classList.remove('hidden');
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('myGamesBtn').style.display = 'inline-block';
        document.getElementById('backToSearchBtn').style.display = 'none';
        document.getElementById('welcomeText').textContent = `Welcome, ${this.currentUser.display_name}!`;
        this.currentView = 'search';
        this.currentPage = 1;
        this.allGames = [];
        this.hasMoreGames = true;
        this.totalPages = 0;
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    showSearch() {
        document.getElementById('myGamesSection').classList.add('hidden');
        document.getElementById('searchSection').classList.remove('hidden');
        document.getElementById('backToSearchBtn').style.display = 'none';
        document.getElementById('myGamesBtn').style.display = 'inline-block';
        this.currentView = 'search';
        this.displaySearchResults(this.allGames, true);
        this.updatePaginationButtons();
    }

    showMyGames() {
        document.getElementById('searchSection').classList.add('hidden');
        document.getElementById('myGamesSection').classList.remove('hidden');
        document.getElementById('backToSearchBtn').style.display = 'inline-block';
        document.getElementById('myGamesBtn').style.display = 'none';
        this.currentView = 'myGames';
        this.loadMyGames();
    }

    toggleEditMode(isEdit) {
        this.isEditMode = isEdit;
        document.getElementById('editListBtn').style.display = isEdit ? 'none' : 'inline-block';
        document.getElementById('doneEditingBtn').style.display = isEdit ? 'inline-block' : 'none';
        this.loadMyGames();
    }

    logout() {
        this.clearAuth();
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('searchSection').classList.add('hidden');
        document.getElementById('myGamesSection').classList.add('hidden');
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('backToSearchBtn').style.display = 'none';
        this.currentSearchResults = [];
        this.currentFilters = {};
        this.allGames = [];
        this.currentSort = 'rating';
        this.currentPage = 1;
        this.totalPages = 0;
        this.hasMoreGames = true;
        this.isLoading = false;
        this.retryCount = 0;
        
        // Reset My Games sort
        this.currentMyGamesSort = 'recently_added';
        this.myGamesCache = [];
        
        this.updatePaginationButtons();
    }

    clearAuth() {
        this.authData = {};
        this.authToken = null;
        this.currentUser = null;
    }

    toggleFilterSection() {
        const filterSection = document.getElementById('filterSection');
        filterSection.classList.toggle('hidden');
    }

    applyFilters() {
        const genre = document.getElementById('genre').value;
        const publisher = document.getElementById('publisher').value;
        const developer = document.getElementById('developer').value;
        const platform = document.getElementById('platform').value;

        this.currentFilters = { genre, publisher, developer, platform };
        this.currentPage = 1;
        this.allGames = [];
        this.hasMoreGames = true;
        this.totalPages = 0;
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    resetFilters() {
        document.getElementById('genre').value = '';
        document.getElementById('publisher').value = '';
        document.getElementById('developer').value = '';
        document.getElementById('platform').value = '';

        this.currentFilters = {};
        this.currentPage = 1;
        this.allGames = [];
        this.hasMoreGames = true;
        this.totalPages = 0;
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    sortMyGames(games) {
        let sortedGames = [...games];

        // Apply sorting
        switch (this.currentMyGamesSort) {
            case 'recently_added':
                // Sort by date added (newest first)
                sortedGames.sort((a, b) => {
                    if (a.date_added && b.date_added) {
                        return new Date(b.date_added) - new Date(a.date_added);
                    }
                    return b.id - a.id; // Fallback to ID
                });
                break;
            case 'name':
                sortedGames.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'name_desc':
                sortedGames.sort((a, b) => b.name.localeCompare(a.name));
                break;
            case 'score_high':
                sortedGames.sort((a, b) => (b.score || 0) - (a.score || 0));
                break;
            case 'score_low':
                sortedGames.sort((a, b) => (a.score || 0) - (b.score || 0));
                break;
            case 'rating_high':
                sortedGames.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'rating_low':
                sortedGames.sort((a, b) => (a.rating || 0) - (b.rating || 0));
                break;
        }

        return sortedGames;
    }

    populateFilterOptions() {
        const genres = new Set();
        const publishers = new Set();
        const developers = new Set();
        const platforms = new Set();

        this.allGames.forEach(game => {
            if (game.genres) game.genres.forEach(genre => genres.add(genre.name));
            if (game.publishers) game.publishers.forEach(pub => publishers.add(pub.name));
            if (game.developers) game.developers.forEach(dev => developers.add(dev.name));
            if (game.platforms) game.platforms.forEach(plat => platforms.add(plat.name));
        });

        const genreSelect = document.getElementById('genre');
        const currentGenre = genreSelect.value;
        genreSelect.innerHTML = '<option value="">All Genres</option>';
        Array.from(genres).sort().forEach(genre => {
            const selected = currentGenre === genre ? 'selected' : '';
            genreSelect.innerHTML += `<option value="${genre}" ${selected}>${genre}</option>`;
        });

        const publisherSelect = document.getElementById('publisher');
        const currentPublisher = publisherSelect.value;
        publisherSelect.innerHTML = '<option value="">All Publishers</option>';
        Array.from(publishers).sort().forEach(pub => {
            const selected = currentPublisher === pub ? 'selected' : '';
            publisherSelect.innerHTML += `<option value="${pub}" ${selected}>${pub}</option>`;
        });

        const developerSelect = document.getElementById('developer');
        const currentDeveloper = developerSelect.value;
        developerSelect.innerHTML = '<option value="">All Developers</option>';
        Array.from(developers).sort().forEach(dev => {
            const selected = currentDeveloper === dev ? 'selected' : '';
            developerSelect.innerHTML += `<option value="${dev}" ${selected}>${dev}</option>`;
        });

        const platformSelect = document.getElementById('platform');
        const currentPlatform = platformSelect.value;
        platformSelect.innerHTML = '<option value="">All Platforms</option>';
        Array.from(platforms).sort().forEach(plat => {
            const selected = currentPlatform === plat ? 'selected' : '';
            platformSelect.innerHTML += `<option value="${plat}" ${selected}>${plat}</option>`;
        });
    }

    async searchGames() {
        if (this.isLoading) return;
        const searchTerm = document.getElementById('searchInput').value.trim();
        this.currentFilters.search = searchTerm;
        this.currentPage = 1;
        this.allGames = [];
        this.hasMoreGames = true;
        this.totalPages = 0;
        this.retryCount = 0;
        window.scrollTo(0, 0);
        this.fetchGames(true);
        this.updatePaginationButtons();
    }

    async loadMyGames() {
        try {
            const response = await fetch(`${this.API_BASE}/user/games`, {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            const data = await response.json();

            if (response.ok) {
                this.myGamesCache = data.games;
                
                // Set sort dropdown to current sort
                const sortSelect = document.getElementById('myGamesSort');
                if (sortSelect) {
                    sortSelect.value = this.currentMyGamesSort;
                }
                
                const sortedGames = this.sortMyGames(data.games);
                this.displayMyGames(sortedGames);
            } else {
                this.showError(document.getElementById('myGamesGrid'), 'Failed to fetch games. Please try again.');
            }
        } catch (error) {
            console.error('Load my games error:', error);
            this.showError(document.getElementById('myGamesGrid'), 'Network error. Please try again.');
        }
    }

    displaySearchResults(games, replace = true) {
        const container = document.getElementById('searchResults');

        if (games.length === 0 && replace) {
            container.innerHTML = '<div class="empty-state">No games found.</div>';
            return;
        }

        const html = games.map(game => 
            `<div class="game-card" data-game-id="${game.id}">
                <img src="${game.background_image || 'https://via.placeholder.com/300x200?text=No+Image'}" 
                     alt="${game.name}" class="game-image" 
                     loading="lazy"
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
            </div>`
        ).join('');

        if (replace) {
            container.innerHTML = html;
        } else {
            container.insertAdjacentHTML('beforeend', html);
        }

        container.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => {
                const gameId = card.dataset.gameId;
                this.showGameDetails(gameId);
            });
        });
    }

    displayMyGames(games) {
        const container = document.getElementById('myGamesGrid');

        if (games.length === 0) {
            if (this.currentMyGamesSort !== 'recently_added') {
                container.innerHTML = '<div class="empty-state">No games match your sort criteria. Try a different sort option.</div>';
            } else {
                container.innerHTML = '<div class="empty-state">Your game list is empty. Search and add some games!</div>';
            }
            return;
        }

        // Use list layout for My Games with images
        if (this.isEditMode) {
            container.innerHTML = games.map(game => 
                `<div class="list-item" data-game-id="${game.id}">
                    <img src="${game.background_image || 'https://via.placeholder.com/80x80?text=No+Image'}" 
                         alt="${game.name}" class="list-game-image" 
                         loading="lazy"
                         onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'">
                    <div class="list-game-content">
                        <div class="list-game-info">
                            <div class="list-game-name">${game.name}</div>
                            <div class="list-game-genres">
                                ${(game.genres || []).slice(0, 3).map(genre => 
                                    `<span class="list-genre-tag">${genre.name}</span>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="list-game-score">
                            <span class="list-game-score-display">${game.score ? `${game.score}/10` : 'No Score'}</span>
                        </div>
                        <div class="list-game-actions">
                            <button class="btn small update-btn" data-game-id="${game.id}">Update</button>
                            <button class="btn small danger delete-btn" data-game-id="${game.id}" data-game-name="${game.name}">Remove</button>
                        </div>
                    </div>
                </div>`
            ).join('');
        } else {
            container.innerHTML = games.map(game => 
                `<div class="list-item" data-game-id="${game.id}">
                    <img src="${game.background_image || 'https://via.placeholder.com/80x80?text=No+Image'}" 
                         alt="${game.name}" class="list-game-image" 
                         loading="lazy"
                         onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'">
                    <div class="list-game-content">
                        <div class="list-game-info">
                            <div class="list-game-name">${game.name}</div>
                            <div class="list-game-genres">
                                ${(game.genres || []).slice(0, 3).map(genre => 
                                    `<span class="list-genre-tag">${genre.name}</span>`
                                ).join('')}
                        </div>
                        </div>
                        <div class="list-game-score">
                            <span class="list-game-score-display">${game.score ? `${game.score}/10` : 'No Score'}</span>
                        </div>
                    </div>
                </div>`
            ).join('');
        }
    }

    async showGameDetails(gameId, fromMyGames = false) {
        try {
            const response = await fetch(`${this.API_BASE}/games/${gameId}`);
            const game = await response.json();

            if (response.ok) {
                // Only show Add to List section when NOT from My Games
                const showAddToList = !fromMyGames && this.currentView !== 'myGames';
                
                document.getElementById('gameDetails').innerHTML = 
                    `<img src="${game.background_image || 'https://via.placeholder.com/700x250?text=No+Image'}" 
                        alt="${game.name}" class="detail-image" 
                        loading="lazy"
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
                    ${showAddToList ? `
                    <div class="add-to-list">
                        <h3>Add to My List</h3>
                        <div style="margin: 15px 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <label for="gameScore" style="color: #fff;">Score (1-10):</label>
                            <div class="score-input-container">
                                <input type="number" id="gameScore" class="score-input" min="1" max="10" placeholder="Score">
                            </div>
                            <button class="btn add-to-list-btn" data-game-id="${game.id}">Add to List</button>
                        </div>
                        <div id="addGameMessage"></div>
                    </div>
                    ` : ''}`;
                document.getElementById('gameModal').style.display = 'block';
            }
        } catch (error) {
            console.error('Show game details error:', error);
            this.showError(document.getElementById('gameDetails'), 'Error fetching game details. Please try again.');
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
                    this.loadMyGames();
                }, 1500);
            } else {
                this.showError(messageDiv, data.error || 'Failed to remove game');
            }
        } catch (error) {
            console.error('Confirm remove error:', error);
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
                    status: 'completed',
                    score: parseInt(score),
                    progress_hours: null
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(messageDiv, 'Score updated successfully!');
                setTimeout(() => {
                    this.closeUpdateModal();
                    this.loadMyGames();
                }, 1500);
            } else {
                this.showError(messageDiv, data.error || 'Failed to update score');
            }
        } catch (error) {
            console.error('Confirm update error:', error);
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
                if (this.currentView === 'myGames') {
                    setTimeout(() => this.loadMyGames(), 1000);
                }
            } else {
                this.showError(messageDiv, data.error);
            }
        } catch (error) {
            console.error('Add to list error:', error);
            this.showError(messageDiv, 'Network error. Please try again.');
        }
    }

    showError(element, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        element.innerHTML = '';
        element.appendChild(errorDiv);
    }

    showSuccess(element, message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.textContent = message;
        element.innerHTML = '';
        element.appendChild(successDiv);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GameListApp();
});