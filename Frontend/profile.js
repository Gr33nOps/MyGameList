const API_BASE = '/api';

let authToken   = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (!authToken) {
    window.location.href = 'auth.html';
} else {
    verifyToken();
}

function calculateLevel(gamesPlayed) {
    if (gamesPlayed === 0) return 1;
    var level            = 1;
    var gamesForNextLevel = 5;
    var totalGamesNeeded = 0;
    var increment        = 5;
    while (totalGamesNeeded + gamesForNextLevel <= gamesPlayed) {
        totalGamesNeeded  += gamesForNextLevel;
        level++;
        gamesForNextLevel += Math.floor(increment);
        increment         += 0.5;
    }
    return level;
}

async function verifyToken() {
    try {
        var response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            var data = await response.json();
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
    var welcomeText = document.getElementById('welcomeText');
    if (welcomeText) welcomeText.textContent = 'Welcome, ' + currentUser.display_name + '!';

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    document.getElementById('editProfileBtn').addEventListener('click', showEditMode);
    document.getElementById('cancelEditBtn').addEventListener('click', showDisplayMode);
    document.getElementById('changePasswordBtn').addEventListener('click', showPasswordModal);
    document.getElementById('closePasswordModal').addEventListener('click', closePasswordModal);
    document.getElementById('cancelPasswordBtn').addEventListener('click', closePasswordModal);
    document.getElementById('editProfileForm').addEventListener('submit', handleProfileUpdate);
    document.getElementById('changePasswordForm').addEventListener('submit', handlePasswordChange);

    var avatarInput = document.getElementById('editAvatarUrl');
    if (avatarInput) {
        avatarInput.addEventListener('input', function(e) {
            var preview = document.getElementById('editAvatarPreview');
            if (preview && e.target.value) preview.src = e.target.value;
        });
    }

    document.getElementById('passwordModal').addEventListener('click', function(e) {
        if (e.target.id === 'passwordModal') closePasswordModal();
    });

    loadProfile();
}

async function loadProfile() {
    try {
        var profileResponse = await fetch(`${API_BASE}/user/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (profileResponse.ok) {
            var profileData = await profileResponse.json();
            displayProfile(profileData.user);
        }

        var results = await Promise.all([
            fetch(`${API_BASE}/user/games`,  { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/followers`,    { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/following`,    { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        var gamesData     = await results[0].json();
        var followersData = await results[1].json();
        var followingData = await results[2].json();

        displayStats(gamesData.games, followersData.followers, followingData.following);
    } catch (error) {
        console.error('Load profile error:', error);
    }
}

function displayProfile(user) {
    var avatarUrl = user.avatar_url ||
        'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.display_name || user.username) + '&size=200&background=3b82f6&color=fff&bold=true';

    document.getElementById('displayAvatar').src           = avatarUrl;
    document.getElementById('editAvatarPreview').src       = avatarUrl;
    document.getElementById('displayName').textContent     = user.display_name || '-';
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('displayEmail').textContent    = user.email;
    document.getElementById('displayCreatedAt').textContent = formatDate(user.created_at);
    document.getElementById('editDisplayName').value       = user.display_name || '';
    document.getElementById('editEmail').value             = user.email;
    document.getElementById('editAvatarUrl').value         = user.avatar_url || '';
}

function displayStats(games, followers, following) {
    var totalGames = games.length;
    document.getElementById('userLevel').textContent      = calculateLevel(totalGames);
    document.getElementById('totalGames').textContent     = totalGames;
    document.getElementById('followersCount').textContent = followers.length;
    document.getElementById('followingCount').textContent = following.length;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
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
    var messageDiv  = document.getElementById('editMessage');
    var displayName = document.getElementById('editDisplayName').value;
    var email       = document.getElementById('editEmail').value;
    var avatarUrl   = document.getElementById('editAvatarUrl').value;

    try {
        var response = await fetch(`${API_BASE}/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ display_name: displayName, email: email, avatar_url: avatarUrl || null })
        });
        var data = await response.json();

        if (response.ok) {
            showSuccess(messageDiv, 'Profile updated successfully!');
            currentUser = Object.assign({}, currentUser, data.user);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            setTimeout(function() { loadProfile(); showDisplayMode(); }, 1500);
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
    var messageDiv      = document.getElementById('passwordMessage');
    var currentPassword = document.getElementById('currentPassword').value;
    var newPassword     = document.getElementById('newPassword').value;
    var confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showError(messageDiv, 'New passwords do not match');
        return;
    }
    if (newPassword.length < 8) {
        showError(messageDiv, 'Password must be at least 8 characters');
        return;
    }

    try {
        var response = await fetch(`${API_BASE}/user/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });
        var data = await response.json();

        if (response.ok) {
            showSuccess(messageDiv, 'Password updated successfully!');
            setTimeout(closePasswordModal, 1500);
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
    window.location.href = 'auth.html';
}

function showError(element, message) {
    element.innerHTML = '<div class="error">' + message + '</div>';
}

function showSuccess(element, message) {
    element.innerHTML = '<div class="success">' + message + '</div>';
}