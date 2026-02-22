const API_BASE = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));

// Check authentication
if (!authToken) {
    window.location.href = 'index.html';
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

function initPage() {
    document.getElementById('searchUsersBtn').addEventListener('click', searchUsers);
    
    const searchInput = document.getElementById('userSearchInput');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchUsers();
    });
    
    // Load following only
    loadFollowing();
}

async function loadFollowing() {
    try {
        const response = await fetch(`${API_BASE}/following`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayFollowing(data.following);
        }
    } catch (error) {
        console.error('Load following error:', error);
    }
}

function displayFollowing(following) {
    const container = document.getElementById('followingList');
    const count = document.getElementById('followingCount');
    
    count.textContent = `${following.length} following`;
    
    if (following.length === 0) {
        container.innerHTML = '<div class="empty-state">Not following anyone yet. Search for users to follow!</div>';
        return;
    }
    
    container.innerHTML = following.map(user => {
        const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&size=80&background=3b82f6&color=fff&bold=true`;
        const followedDate = new Date(user.followed_since).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        
        return `
            <div class="friend-item">
                <img src="${avatarUrl}" alt="${user.display_name}" class="friend-avatar" onerror="this.src='https://ui-avatars.com/api/?name=User&size=80&background=3b82f6&color=fff&bold=true'">
                <div class="friend-info">
                    <div class="friend-name">${user.display_name || user.username}</div>
                    <div class="friend-username">@${user.username}</div>
                    <div class="friend-since">Following since ${followedDate}</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-primary" onclick="viewProfile(${user.id})">View Profile</button>
                    <button class="btn btn-danger" onclick="unfollowUser(${user.id})">Unfollow</button>
                </div>
            </div>
        `;
    }).join('');
}

async function searchUsers() {
    const query = document.getElementById('userSearchInput').value.trim();
    
    if (query.length < 2) {
        document.getElementById('searchResults').classList.add('hidden');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/search?query=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            displaySearchResults(data.users);
        }
    } catch (error) {
        console.error('Search users error:', error);
        document.getElementById('searchResults').classList.remove('hidden');
        document.getElementById('userSearchResults').innerHTML = '<div class="empty-state">Error loading search results. Please try again.</div>';
    }
}

async function displaySearchResults(users) {
    const container = document.getElementById('userSearchResults');
    const section = document.getElementById('searchResults');
    
    section.classList.remove('hidden');
    
    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state">No users found.</div>';
        return;
    }
    
    // Show loading state
    container.innerHTML = '<div class="empty-state">Loading...</div>';
    
    // Check follow status for each user
    const statusChecks = await Promise.all(
        users.map(user => checkFollowStatus(user.id).catch(() => ({ isFollowing: false, followsYou: false })))
    );
    
    container.innerHTML = users.map((user, index) => {
        const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&size=80&background=3b82f6&color=fff&bold=true`;
        const status = statusChecks[index];
        
        let followButton = '';
        if (status.isFollowing) {
            followButton = `<button class="btn btn-danger" onclick="unfollowUser(${user.id})">Unfollow</button>`;
        } else {
            followButton = `<button class="btn btn-success" onclick="followUser(${user.id})">Follow</button>`;
        }
        
        let badge = '';
        if (status.followsYou) {
            badge = '<span class="badge" style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">Follows you</span>';
        }
        
        return `
            <div class="friend-item">
                <img src="${avatarUrl}" alt="${user.display_name}" class="friend-avatar" onerror="this.src='https://ui-avatars.com/api/?name=User&size=80&background=3b82f6&color=fff&bold=true'">
                <div class="friend-info">
                    <div class="friend-name">${user.display_name || user.username}${badge}</div>
                    <div class="friend-username">@${user.username}</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-primary" onclick="viewProfile(${user.id})">View Profile</button>
                    ${followButton}
                </div>
            </div>
        `;
    }).join('');
}

async function checkFollowStatus(userId) {
    try {
        const response = await fetch(`${API_BASE}/follow/status/${userId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            return await response.json();
        }
        return { isFollowing: false, followsYou: false };
    } catch (error) {
        console.error('Check follow status error:', error);
        return { isFollowing: false, followsYou: false };
    }
}

async function followUser(userId) {
    try {
        const response = await fetch(`${API_BASE}/follow/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            loadFollowing();
            // Refresh search results if visible
            const searchInput = document.getElementById('userSearchInput');
            if (searchInput.value.trim().length >= 2) {
                searchUsers();
            }
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to follow user');
        }
    } catch (error) {
        console.error('Follow user error:', error);
        alert('Failed to follow user. Please try again.');
    }
}

async function unfollowUser(userId) {
    if (!confirm('Are you sure you want to unfollow this user?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/follow/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            loadFollowing();
            // Refresh search results if visible
            const searchInput = document.getElementById('userSearchInput');
            if (searchInput.value.trim().length >= 2) {
                searchUsers();
            }
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to unfollow user');
        }
    } catch (error) {
        console.error('Unfollow user error:', error);
        alert('Failed to unfollow user. Please try again.');
    }
}

function viewProfile(userId) {
    console.log('Viewing profile for user ID:', userId);
    window.location.href = `userProfile.html?userId=${userId}`;
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}