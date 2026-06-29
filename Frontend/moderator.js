const API_BASE = '/api';

let authToken   = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser'));

let usersPage    = 1;
let activityPage = 1;
const itemsPerPage = 20;

let banUserId = null;

if (!authToken) {
    window.location.href = 'index.html';
} else {
    verifyModerator();
}

async function verifyModerator() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));

            if (!currentUser.is_moderator && !currentUser.is_admin) {
                alert('Access denied. Moderator privileges required.');
                window.location.href = 'home.html';
                return;
            }

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
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('confirmBan').addEventListener('click', handleBanUser);
    document.getElementById('cancelBan').addEventListener('click', closeBanModal);
    document.getElementById('closeBanModal').addEventListener('click', closeBanModal);

    document.getElementById('searchUsersBtn').addEventListener('click', function() {
        usersPage = 1;
        loadUsers();
    });

    document.getElementById('filterActivityBtn').addEventListener('click', function() {
        activityPage = 1;
        loadActivity();
    });

    document.getElementById('searchUsers').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            usersPage = 1;
            loadUsers();
        }
    });

    document.getElementById('prevUsersPage').addEventListener('click', function() {
        if (usersPage > 1) {
            usersPage--;
            loadUsers();
        }
    });

    document.getElementById('nextUsersPage').addEventListener('click', function() {
        usersPage++;
        loadUsers();
    });

    document.getElementById('prevActivityPage').addEventListener('click', function() {
        if (activityPage > 1) {
            activityPage--;
            loadActivity();
        }
    });

    document.getElementById('nextActivityPage').addEventListener('click', function() {
        activityPage++;
        loadActivity();
    });

    document.getElementById('banModal').addEventListener('click', function(e) {
        if (e.target.id === 'banModal') closeBanModal();
    });

    loadStats();
    loadUsers();
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');

    document.querySelectorAll('.admin-section').forEach(function(section) {
        section.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'manage-users') loadUsers();
    if (tabName === 'activity-log') loadActivity();
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/moderator/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalUsers').textContent      = stats.totalUsers      || 0;
            document.getElementById('totalModerators').textContent = stats.totalModerators || 0;
            document.getElementById('bannedUsers').textContent     = stats.bannedUsers     || 0;
        }
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

async function loadUsers() {
    const tbody      = document.getElementById('usersTableBody');
    const loading    = document.getElementById('usersTableLoading');
    const searchTerm = document.getElementById('searchUsers').value.trim();

    loading.style.display = 'flex';
    tbody.innerHTML = '';

    try {
        const offset = (usersPage - 1) * itemsPerPage;
        const params = new URLSearchParams({ limit: itemsPerPage, offset: offset });
        if (searchTerm) params.append('search', searchTerm);

        const response = await fetch(`${API_BASE}/moderator/users?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayUsers(data.users);
            updateUsersPagination(data.users.length === itemsPerPage);
        } else {
            const errorData = await response.json().catch(function() { return { error: 'Unknown error' }; });
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Error: ' + (errorData.error || 'Failed to load users') + '</td></tr>';
        }
    } catch (error) {
        console.error('Load users error:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Network Error: ' + error.message + '</td></tr>';
    } finally {
        loading.style.display = 'none';
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(function(user) {
        const username    = (user.username    || '').replace(/'/g, '&#39;');
        const email       = user.email        || 'N/A';
        const displayName = user.display_name || 'N/A';
        const joinDate    = user.created_at   ? new Date(user.created_at).toLocaleDateString() : 'N/A';

        const isBanned      = user.is_banned;
        const isCurrentUser = user.id === currentUser.id;
        const isModerator   = user.is_moderator;
        const isAdmin       = user.is_admin;

        var statusBadge;
        if (isBanned) {
            const bannedDate = user.banned_at ? new Date(user.banned_at).toLocaleDateString() : '';
            statusBadge = '<span class="banned-badge" title="Banned on ' + bannedDate + '">Banned</span>';
        } else {
            statusBadge = '<span style="color:#22c55e;">Active</span>';
        }

        var roleBadge;
        if (isAdmin)          roleBadge = '<span class="admin-badge">Admin</span>';
        else if (isModerator) roleBadge = '<span class="moderator-badge">Moderator</span>';
        else                  roleBadge = '<span style="color:#94a3b8;">User</span>';

        var actionButtons;
        if (isCurrentUser) {
            actionButtons = '<span style="color:#94a3b8;font-size:0.85rem;">Current User</span>';
        } else if (isModerator || isAdmin) {
            actionButtons = '<span style="color:#fbbf24;font-size:0.85rem;">Moderator/Admin (Protected)</span>';
        } else if (isBanned) {
            actionButtons = '<button class="btn btn-success btn-sm" data-action="unban" data-user-id="' + user.id + '" data-username="' + username + '">Unban</button>';
        } else {
            actionButtons = '<button class="btn btn-warning btn-sm" data-action="ban" data-user-id="' + user.id + '" data-username="' + username + '">Ban</button>';
        }

        return '<tr>' +
            '<td>' + user.id + '</td>' +
            '<td><strong>' + username + '</strong></td>' +
            '<td>' + email + '</td>' +
            '<td>' + displayName + '</td>' +
            '<td>' + roleBadge + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + joinDate + '</td>' +
            '<td>' + actionButtons + '</td>' +
            '</tr>';
    }).join('');

    tbody.querySelectorAll('button[data-action]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const action   = btn.dataset.action;
            const userId   = btn.dataset.userId;
            const username = btn.dataset.username;

            if (action === 'ban')   confirmBanUser(userId, username);
            if (action === 'unban') unbanUser(userId, username);
        });
    });
}

function updateUsersPagination(hasMore) {
    document.getElementById('prevUsersPage').disabled = usersPage === 1;
    document.getElementById('nextUsersPage').disabled = !hasMore;
    document.getElementById('usersPageInfo').textContent = 'Page ' + usersPage;
}

function confirmBanUser(userId, username) {
    banUserId = userId;
    const decodedName = username.replace(/&#39;/g, "'");
    document.getElementById('banUsername').textContent  = decodedName;
    document.getElementById('banReason').value          = '';
    document.getElementById('banMessage').innerHTML     = '';
    document.getElementById('banModal').style.display   = 'flex';
}

async function handleBanUser() {
    if (!banUserId) return;

    const reason        = document.getElementById('banReason').value.trim();
    const confirmButton = document.getElementById('confirmBan');
    const messageDiv    = document.getElementById('banMessage');

    confirmButton.disabled    = true;
    confirmButton.textContent = 'Banning...';
    messageDiv.innerHTML      = '';

    try {
        const response = await fetch(`${API_BASE}/moderator/users/${banUserId}/ban`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ reason: reason || null })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess(messageDiv, 'User banned successfully!');
            setTimeout(function() {
                closeBanModal();
                loadUsers();
                loadStats();
            }, 1500);
        } else {
            showError(messageDiv, data.error || 'Failed to ban user');
            confirmButton.disabled    = false;
            confirmButton.textContent = 'Ban User';
        }
    } catch (error) {
        console.error('Ban user error:', error);
        showError(messageDiv, 'Network error. Please try again.');
        confirmButton.disabled    = false;
        confirmButton.textContent = 'Ban User';
    }
}

async function unbanUser(userId, username) {
    if (!confirm('Are you sure you want to unban ' + username.replace(/&#39;/g, "'") + '?')) return;

    try {
        const response = await fetch(`${API_BASE}/moderator/users/${userId}/unban`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            loadUsers();
            loadStats();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to unban user');
        }
    } catch (error) {
        console.error('Unban user error:', error);
        alert('Network error. Please try again.');
    }
}

function closeBanModal() {
    document.getElementById('banModal').style.display = 'none';
    banUserId = null;
    document.getElementById('banReason').value      = '';
    document.getElementById('banMessage').innerHTML = '';

    const confirmButton       = document.getElementById('confirmBan');
    confirmButton.disabled    = false;
    confirmButton.textContent = 'Ban User';
}

async function loadActivity() {
    const tbody   = document.getElementById('activityTableBody');
    const loading = document.getElementById('activityTableLoading');
    const filter  = document.getElementById('activityFilter').value;

    loading.style.display = 'flex';
    tbody.innerHTML = '';

    try {
        const offset = (activityPage - 1) * itemsPerPage;
        const params = new URLSearchParams({ limit: itemsPerPage, offset: offset });
        if (filter) params.append('action_type', filter);

        const response = await fetch(`${API_BASE}/moderator/activity?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            displayActivity(data.activities || []);
            updateActivityPagination(data.activities.length === itemsPerPage);
        } else {
            const errorData = await response.json().catch(function() { return { error: 'Unknown error' }; });
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Error: ' + (errorData.error || 'Failed to load activity') + '</td></tr>';
        }
    } catch (error) {
        console.error('Load activity error:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Network Error: ' + error.message + '</td></tr>';
    } finally {
        loading.style.display = 'none';
    }
}

function displayActivity(activities) {
    const tbody = document.getElementById('activityTableBody');

    if (activities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No activity found</td></tr>';
        return;
    }

    tbody.innerHTML = activities.map(function(activity) {
        const dateStr = new Date(activity.created_at).toLocaleString();
        var details = activity.details || '-';
        var target  = activity.target_username || activity.target_name || ('ID: ' + activity.target_id);

        if (activity.action_type === 'seed_games') {
            target = '<span style="color:#a5b4fc;font-weight:600;">Automatic Import</span>';
            const match = details.match(/Pages:\s*(\d+)\s*to\s*(\d+).*Added:\s*(\d+)/);
            if (match) {
                details = '<div style="line-height:1.8;"><strong style="color:#a5b4fc;">Imported from page ' + match[1] + ' to ' + match[2] + '</strong><br><span style="color:#86efac;">' + match[3] + ' games added successfully</span></div>';
            } else {
                details = '<span style="color:#a5b4fc;">' + details + '</span>';
            }
        } else if (activity.action_type === 'add_game') {
            target  = '<span style="color:#86efac;">' + (activity.target_name || target) + '</span>';
            details = details !== '-' ? '<span style="color:#cbd5e1;">' + details + '</span>' : '<span style="color:#cbd5e1;">Added manually</span>';
        } else if (activity.action_type === 'edit_game') {
            target  = '<span style="color:#fbbf24;">' + (activity.target_name || target) + '</span>';
            details = '<span style="color:#cbd5e1;">' + details + '</span>';
        } else if (activity.action_type === 'delete_game') {
            target  = '<span style="color:#fca5a5;">' + (activity.target_name || target) + '</span>';
            details = '<span style="color:#cbd5e1;">' + details + '</span>';
        } else if (activity.action_type === 'ban_user') {
            target  = '<span style="color:#fca5a5;">' + (activity.target_username || target) + '</span>';
            details = '<span style="color:#fca5a5;">Reason: ' + details + '</span>';
        } else if (activity.action_type === 'unban_user') {
            target  = '<span style="color:#86efac;">' + (activity.target_username || target) + '</span>';
            details = '<span style="color:#86efac;">' + details + '</span>';
        } else if (activity.action_type === 'promote_moderator' || activity.action_type === 'demote_moderator') {
            target  = '<span style="color:#a5b4fc;">' + (activity.target_username || target) + '</span>';
            details = '<span style="color:#cbd5e1;">' + details + '</span>';
        } else if (activity.action_type === 'delete_user') {
            target  = '<span style="color:#ef4444;">' + (activity.target_username || target) + '</span>';
            details = '<span style="color:#fca5a5;">' + details + '</span>';
        }

        return '<tr>' +
            '<td style="white-space:nowrap;">' + dateStr + '</td>' +
            '<td><strong style="color:#e2e8f0;">' + (activity.moderator_username || 'Unknown') + '</strong></td>' +
            '<td><span class="action-badge">' + formatActionType(activity.action_type) + '</span></td>' +
            '<td>' + target + '</td>' +
            '<td style="max-width:450px;word-wrap:break-word;">' + details + '</td>' +
            '</tr>';
    }).join('');
}

function updateActivityPagination(hasMore) {
    document.getElementById('prevActivityPage').disabled = activityPage === 1;
    document.getElementById('nextActivityPage').disabled = !hasMore;
    document.getElementById('activityPageInfo').textContent = 'Page ' + activityPage;
}

function formatActionType(actionType) {
    const formats = {
        ban_user:          'Ban User',
        unban_user:        'Unban User',
        add_game:          'Add Game',
        edit_game:         'Edit Game',
        delete_game:       'Delete Game',
        seed_games:        'Bulk Import',
        promote_moderator: 'Promote Mod',
        demote_moderator:  'Demote Mod',
        delete_user:       'Delete User'
    };
    return formats[actionType] || actionType;
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showError(element, message) {
    element.innerHTML = '<div class="error" style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:6px;color:#fca5a5;margin:15px 0;">' + message + '</div>';
}

function showSuccess(element, message) {
    element.innerHTML = '<div class="success" style="padding:12px;background:rgba(34,197,94,0.1);border:1px solid #22c55e;border-radius:6px;color:#86efac;margin:15px 0;">' + message + '</div>';
}