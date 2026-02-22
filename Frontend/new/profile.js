const API_BASE = 'http://localhost:3000/api';
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));

// Check authentication
if (!authToken) {
    window.location.href = 'index.html';
} else {
    verifyToken();
}

// Level calculation function
function calculateLevel(gamesPlayed) {
    if (gamesPlayed === 0) return 1;
    
    let level = 1;
    let gamesForNextLevel = 5;
    let totalGamesNeeded = 0;
    let increment = 5;
    
    while (totalGamesNeeded + gamesForNextLevel <= gamesPlayed) {
        totalGamesNeeded += gamesForNextLevel;
        level++;
        gamesForNextLevel += Math.floor(increment);
        increment += 0.5;
    }
    
    return level;
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

    // Optional welcome text
    const welcomeText = document.getElementById('welcomeText');
    if (welcomeText) {
        welcomeText.textContent = `Welcome, ${currentUser.display_name}!`;
    }

    // Optional logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Required buttons
    document.getElementById('editProfileBtn').addEventListener('click', showEditMode);
    document.getElementById('cancelEditBtn').addEventListener('click', showDisplayMode);
    document.getElementById('changePasswordBtn').addEventListener('click', showPasswordModal);
    document.getElementById('closePasswordModal').addEventListener('click', closePasswordModal);
    document.getElementById('cancelPasswordBtn').addEventListener('click', closePasswordModal);
    document.getElementById('editProfileForm').addEventListener('submit', handleProfileUpdate);
    document.getElementById('changePasswordForm').addEventListener('submit', handlePasswordChange);

    // Avatar preview
    const avatarInput = document.getElementById('editAvatarUrl');
    if (avatarInput) {
        avatarInput.addEventListener('input', (e) => {
            const preview = document.getElementById('editAvatarPreview');
            if (preview && e.target.value) {
                preview.src = e.target.value;
            }
        });
    }

    // Modal outside click
    document.getElementById('passwordModal').addEventListener('click', (e) => {
        if (e.target.id === 'passwordModal') closePasswordModal();
    });

    loadProfile();
}

async function loadProfile() {
    try {
        // Get user profile
        const response = await fetch(`${API_BASE}/user/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayProfile(data.user);
        }
        
        // Get user stats
        const [gamesResponse, followersResponse, followingResponse] = await Promise.all([
            fetch(`${API_BASE}/user/games`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }),
            fetch(`${API_BASE}/followers`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            }),
            fetch(`${API_BASE}/following`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            })
        ]);
        
        const gamesData = await gamesResponse.json();
        const followersData = await followersResponse.json();
        const followingData = await followingResponse.json();
        
        displayStats(gamesData.games, followersData.followers, followingData.following);
    } catch (error) {
        console.error('Load profile error:', error);
    }
}

function displayProfile(user) {
    // Update avatar
    const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&size=200&background=3b82f6&color=fff&bold=true`;
    document.getElementById('displayAvatar').src = avatarUrl;
    document.getElementById('editAvatarPreview').src = avatarUrl;
    
    // Update details
    document.getElementById('displayName').textContent = user.display_name || '-';
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayEmail').textContent = user.email;
    document.getElementById('displayCreatedAt').textContent = formatDate(user.created_at);
    
    // Update edit form
    document.getElementById('editDisplayName').value = user.display_name || '';
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editAvatarUrl').value = user.avatar_url || '';
}

function displayStats(games, followers, following) {
    const totalGames = games.length;
    const level = calculateLevel(totalGames);
    
    // Update all stats
    document.getElementById('userLevel').textContent = level;
    document.getElementById('totalGames').textContent = totalGames;
    document.getElementById('followersCount').textContent = followers.length;
    document.getElementById('followingCount').textContent = following.length;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function showEditMode() {
    document.getElementById('profileDisplay').classList.add('hidden');
    document.getElementById('profileEdit').classList.remove('hidden');
    document.getElementById('editMessage').innerHTML = '';
}

function showDisplayMode() {
    document.getElementById('profileEdit').classList.add('hidden');
    document.getElementById('profileDisplay').classList.remove('hidden');
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('editMessage');
    
    const displayName = document.getElementById('editDisplayName').value;
    const email = document.getElementById('editEmail').value;
    const avatarUrl = document.getElementById('editAvatarUrl').value;
    
    try {
        const response = await fetch(`${API_BASE}/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                display_name: displayName,
                email: email,
                avatar_url: avatarUrl || null
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess(messageDiv, 'Profile updated successfully!');
            
            // Update localStorage
            currentUser = { ...currentUser, ...data.user };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Reload profile
            setTimeout(() => {
                loadProfile();
                showDisplayMode();
            }, 1500);
        } else {
            showError(messageDiv, data.error || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showError(messageDiv, 'Network error. Please try again.');
    }
}

function showPasswordModal() {
    document.getElementById('passwordModal').style.display = 'block';
    document.getElementById('changePasswordForm').reset();
    document.getElementById('passwordMessage').innerHTML = '';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
}

async function handlePasswordChange(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('passwordMessage');
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showError(messageDiv, 'New passwords do not match');
        return;
    }
    
    // Validate password length
    if (newPassword.length < 6) {
        showError(messageDiv, 'Password must be at least 6 characters');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/user/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess(messageDiv, 'Password updated successfully!');
            setTimeout(() => {
                closePasswordModal();
            }, 1500);
        } else {
            showError(messageDiv, data.error || 'Failed to update password');
        }
    } catch (error) {
        console.error('Update password error:', error);
        showError(messageDiv, 'Network error. Please try again.');
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showError(element, message) {
    element.innerHTML = `<div class="error">${message}</div>`;
}

function showSuccess(element, message) {
    element.innerHTML = `<div class="success">${message}</div>`;
}