const API_BASE = '/api';

let pendingEmail = '';

document.addEventListener('DOMContentLoaded', async function() {
    await checkExistingSession();
    await handleUrlParams();
    initializeAuthUI();
});

async function handleUrlParams() {
    const urlParams  = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    const code             = urlParams.get('code')             || hashParams.get('code');
    const tokenHash        = urlParams.get('token_hash')       || hashParams.get('token_hash');
    const type             = urlParams.get('type')             || hashParams.get('type');
    const error            = urlParams.get('error')            || hashParams.get('error');
    const errorDescription = urlParams.get('error_description')|| hashParams.get('error_description');

    if (error) {
        showVerificationError(errorDescription || error);
        return;
    }

    if (type === 'signup' || type === 'email') {
        const verificationToken = tokenHash || code;
        if (verificationToken) {
            await handleEmailVerification(verificationToken);
        }
    } else if (type === 'recovery' && code) {
        window._resetCode = code;
        showNewPasswordForm();
    }
}

async function handleEmailVerification(token) {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationStatus').classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token_hash: token, code: token })
        });

        const data = await response.json();

        if (response.ok) {
            showVerificationSuccess();
            setTimeout(function() {
                window.history.replaceState({}, document.title, '/auth.html');
            }, 2000);
        } else {
            showVerificationError(data.error || 'Verification failed');
        }
    } catch (error) {
        showVerificationError('Network error during verification. Please try again.');
    }
}

function showVerificationError(message) {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationErrorMessage').textContent = message;
    document.getElementById('verificationError').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Verification Failed';
}

async function checkExistingSession() {
    const token = localStorage.getItem('authToken');

    if (token) {
        try {
            const response = await fetch(`${API_BASE}/auth/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                window.location.href = 'home.html';
            } else {
                clearSession();
            }
        } catch (error) {
            clearSession();
        }
    }
}

function clearSession() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('lastActivity');
}

function initializeAuthUI() {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            switchTab(btn.dataset.tab);
        });
    });

    document.querySelectorAll('.password-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            togglePasswordVisibility(btn.dataset.target);
        });
    });

    var regPassword = document.getElementById('regPassword');
    if (regPassword) {
        regPassword.addEventListener('input', function(e) {
            checkPasswordStrength(e.target.value, 'strengthFill', 'strengthText');
        });
    }

    var newPassword = document.getElementById('newPassword');
    if (newPassword) {
        newPassword.addEventListener('input', function(e) {
            checkPasswordStrength(e.target.value, 'newPasswordStrengthFill', 'newPasswordStrengthText');
        });
    }

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('resetPasswordForm').addEventListener('submit', handlePasswordReset);
    document.getElementById('newPasswordForm').addEventListener('submit', handleNewPassword);

    document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
        e.preventDefault();
        showResetPasswordForm();
    });

    document.getElementById('backToLogin').addEventListener('click', showLogin);

    var resendVerification = document.getElementById('resendVerification');
    if (resendVerification) resendVerification.addEventListener('click', resendVerificationEmail);

    var resendFromError = document.getElementById('resendFromError');
    if (resendFromError) resendFromError.addEventListener('click', resendVerificationEmail);

    var changeEmail = document.getElementById('changeEmail');
    if (changeEmail) {
        changeEmail.addEventListener('click', function() {
            hideAllViews();
            switchTab('register');
        });
    }

    document.getElementById('regUsername').addEventListener('blur', validateUsername);
    document.getElementById('regEmail').addEventListener('blur', validateEmail);
    document.getElementById('regConfirmPassword').addEventListener('input', validatePasswordMatch);

    var confirmNewPassword = document.getElementById('confirmNewPassword');
    if (confirmNewPassword) {
        confirmNewPassword.addEventListener('input', function() {
            validatePasswordMatch('newPassword', 'confirmNewPassword');
        });
    }
}

function hideAllViews() {
    document.querySelectorAll('.auth-form').forEach(function(el) {
        el.classList.remove('active');
    });

    var panelIds = ['verificationPending', 'verificationStatus', 'verificationSuccess', 'verificationError', 'successPanel'];
    panelIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    document.getElementById('authTabs').style.display = 'flex';
}

function switchTab(tab) {
    hideAllViews();
    document.querySelectorAll('.tab-btn').forEach(function(t) {
        t.classList.remove('active');
    });
    clearAllErrors();

    if (tab === 'login') {
        var form = document.getElementById('loginForm');
        form.classList.remove('hidden');
        form.classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        clearForm('loginForm');
    } else if (tab === 'register') {
        var form = document.getElementById('registerForm');
        form.classList.remove('hidden');
        form.classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        clearForm('registerForm');
    }
}

function showLogin() {
    hideAllViews();
    switchTab('login');
    document.getElementById('authSubtitle').textContent = 'Track and discover your favorite games';
}

function showResetPasswordForm() {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    var form = document.getElementById('resetPasswordForm');
    form.classList.remove('hidden');
    form.classList.add('active');
    document.getElementById('authSubtitle').textContent = 'Reset Your Password';
}

function showNewPasswordForm() {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    var form = document.getElementById('newPasswordForm');
    form.classList.remove('hidden');
    form.classList.add('active');
    document.getElementById('authSubtitle').textContent = 'Create New Password';
}

function showVerificationPending(email) {
    hideAllViews();
    pendingEmail = email;
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationEmail').textContent = email;
    document.getElementById('verificationPending').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Email Verification';
}

function showVerificationSuccess() {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationSuccess').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Email Verified';
}

async function handleLogin(e) {
    e.preventDefault();

    const emailOrUsername = document.getElementById('loginEmail').value.trim();
    const password        = document.getElementById('loginPassword').value;
    const rememberMe      = document.getElementById('rememberMe').checked;
    const errorDiv        = document.getElementById('loginError');
    const successDiv      = document.getElementById('loginSuccess');
    const btn             = document.getElementById('loginBtn');

    clearError(errorDiv);
    clearError(successDiv);
    setButtonLoading(btn, true);

    if (!emailOrUsername || !password) {
        showError(errorDiv, 'Please enter both email/username and password.');
        setButtonLoading(btn, false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailOrUsername: emailOrUsername, password: password, rememberMe: rememberMe })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            localStorage.setItem('lastActivity', Date.now().toString());

            showSuccess(successDiv, 'Login successful! Redirecting...');

            setTimeout(function() {
                window.location.href = 'home.html';
            }, 500);
        } else {
            if (data.emailNotVerified && data.email) {
                pendingEmail = data.email;
                showError(errorDiv, data.error + ' Would you like to resend the verification email?');

                const resendBtn       = document.createElement('button');
                resendBtn.textContent = 'Resend Verification Email';
                resendBtn.className   = 'btn btn-secondary';
                resendBtn.style.marginTop = '10px';
                resendBtn.style.width     = '100%';
                resendBtn.onclick = async function(e) {
                    e.preventDefault();
                    await resendVerificationEmail();
                };
                errorDiv.appendChild(resendBtn);
            } else {
                showError(errorDiv, data.error || 'Login failed. Please try again.');
            }
            setButtonLoading(btn, false);
        }
    } catch (error) {
        showError(errorDiv, 'Network error. Please check server is running and try again.');
        setButtonLoading(btn, false);
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const email           = document.getElementById('regEmail').value.trim();
    const username        = document.getElementById('regUsername').value.trim();
    const displayName     = document.getElementById('regDisplayName').value.trim();
    const password        = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const agreeTerms      = document.getElementById('agreeTerms').checked;
    const errorDiv        = document.getElementById('registerError');
    const btn             = document.getElementById('registerBtn');

    clearError(errorDiv);
    setButtonLoading(btn, true);

    const validation = validateRegistration(email, username, displayName, password, confirmPassword, agreeTerms);

    if (!validation.valid) {
        showError(errorDiv, validation.error);
        setButtonLoading(btn, false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, email: email, display_name: displayName, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            showVerificationPending(email);
        } else {
            showError(errorDiv, data.error || 'Registration failed. Please try again.');
        }

        setButtonLoading(btn, false);
    } catch (error) {
        showError(errorDiv, 'Network error. Please check server is running and try again.');
        setButtonLoading(btn, false);
    }
}

async function resendVerificationEmail() {
    const btn          = event && event.target ? event.target : document.getElementById('resendVerification');
    const originalText = btn.textContent;

    if (!pendingEmail) {
        alert('No email found. Please try registering again.');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Sending...';

    try {
        const response = await fetch(`${API_BASE}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Verification email sent! Please check your inbox and spam folder.');
        } else {
            alert(data.error || 'Failed to resend email.');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    } finally {
        btn.disabled    = false;
        btn.textContent = originalText;
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();

    const email      = document.getElementById('resetEmail').value.trim();
    const errorDiv   = document.getElementById('resetError');
    const successDiv = document.getElementById('resetSuccess');
    const btn        = document.getElementById('resetBtn');

    clearError(errorDiv);
    clearError(successDiv);
    setButtonLoading(btn, true);

    if (!isValidEmail(email)) {
        showError(errorDiv, 'Please enter a valid email address.');
        setButtonLoading(btn, false);
        return;
    }

    try {
        await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        showSuccess(successDiv, 'If a matching account exists, a reset link has been sent.');
        document.getElementById('resetEmail').value = '';
        setButtonLoading(btn, false);
    } catch (error) {
        showError(errorDiv, 'Network error. Please try again.');
        setButtonLoading(btn, false);
    }
}

async function handleNewPassword(e) {
    e.preventDefault();

    const newPassword     = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    const errorDiv        = document.getElementById('newPasswordError');
    const btn             = document.getElementById('newPasswordBtn');

    clearError(errorDiv);

    if (newPassword !== confirmPassword) {
        showError(errorDiv, 'Passwords do not match.');
        return;
    }

    if (newPassword.length < 8) {
        showError(errorDiv, 'Password must be at least 8 characters.');
        return;
    }

    if (!window._resetCode) {
        showError(errorDiv, 'Invalid or expired reset link. Please request a new one.');
        return;
    }

    setButtonLoading(btn, true);

    try {
        const response = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: window._resetCode, password: newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            window._resetCode = null;
            hideAllViews();
            document.getElementById('authTabs').style.display = 'none';
            document.getElementById('successPanel').classList.remove('hidden');
        } else {
            showError(errorDiv, data.error || 'Password reset failed.');
            setButtonLoading(btn, false);
        }
    } catch (error) {
        showError(errorDiv, 'Network error. Please try again.');
        setButtonLoading(btn, false);
    }
}

function validateRegistration(email, username, displayName, password, confirmPassword, agreeTerms) {
    if (!email || !username || !displayName || !password || !confirmPassword) {
        return { valid: false, error: 'All fields are required.' };
    }
    if (!isValidEmail(email)) {
        return { valid: false, error: 'Please enter a valid email address.' };
    }
    if (!isValidUsername(username)) {
        return { valid: false, error: 'Username must be 3-50 characters and contain only letters, numbers, and underscores.' };
    }
    if (displayName.length < 2 || displayName.length > 100) {
        return { valid: false, error: 'Display name must be between 2 and 100 characters.' };
    }
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long.' };
    }
    if (password !== confirmPassword) {
        return { valid: false, error: 'Passwords do not match.' };
    }
    if (getPasswordStrength(password) < 2) {
        return { valid: false, error: 'Password is too weak. Please use a stronger password.' };
    }
    if (!agreeTerms) {
        return { valid: false, error: 'You must agree to the Terms of Service and Privacy Policy.' };
    }
    return { valid: true };
}

function isValidEmail(email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidUsername(username) {
    var usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
    return usernameRegex.test(username);
}

async function validateUsername() {
    const input    = document.getElementById('regUsername');
    const username = input.value.trim();

    if (username.length < 3) return;

    if (!isValidUsername(username)) {
        input.setCustomValidity('Username must be 3-50 characters (letters, numbers, underscores only)');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/check-username/${username}`);
        const data     = await response.json();
        input.setCustomValidity(data.exists ? 'Username already taken' : '');
    } catch (error) {
        input.setCustomValidity('');
    }
}

function validateEmail() {
    const input = document.getElementById('regEmail');
    const email = input.value.trim();
    input.setCustomValidity(isValidEmail(email) ? '' : 'Please enter a valid email address');
}

function validatePasswordMatch(passwordId, confirmId) {
    var pid = passwordId || 'regPassword';
    var cid = confirmId  || 'regConfirmPassword';

    const password        = document.getElementById(pid).value;
    const confirmPassword = document.getElementById(cid);

    if (confirmPassword.value && password !== confirmPassword.value) {
        confirmPassword.setCustomValidity('Passwords do not match');
    } else {
        confirmPassword.setCustomValidity('');
    }
}

function checkPasswordStrength(password, fillId, textId) {
    const strength     = getPasswordStrength(password);
    const strengthFill = document.getElementById(fillId);
    const strengthText = document.getElementById(textId);

    const levels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['#ff4444', '#ff8800', '#ffbb00', '#88cc00', '#00cc44'];
    const widths = ['20%', '40%', '60%', '80%', '100%'];

    strengthFill.style.width           = widths[strength];
    strengthFill.style.backgroundColor = colors[strength];
    strengthText.textContent           = 'Password strength: ' + levels[strength];
}

function getPasswordStrength(password) {
    var strength = 0;
    if (password.length >= 8)  strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password))   strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return Math.min(strength, 4);
}

function togglePasswordVisibility(inputId) {
    const input  = document.getElementById(inputId);
    const button = document.querySelector('[data-target="' + inputId + '"]');

    if (input.type === 'password') {
        input.type       = 'text';
        button.textContent = 'Hide';
    } else {
        input.type       = 'password';
        button.textContent = 'Show';
    }
}

function setButtonLoading(button, loading) {
    const text   = button.querySelector('.btn-text');
    const loader = button.querySelector('.btn-loader');

    if (loading) {
        text.classList.add('hidden');
        loader.classList.remove('hidden');
        button.disabled = true;
    } else {
        text.classList.remove('hidden');
        loader.classList.add('hidden');
        button.disabled = false;
    }
}

function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showSuccess(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearError(element) {
    element.textContent = '';
    element.classList.add('hidden');
    while (element.lastChild && element.lastChild.nodeName === 'BUTTON') {
        element.removeChild(element.lastChild);
    }
}

function clearAllErrors() {
    document.querySelectorAll('.error, .success').forEach(function(el) {
        clearError(el);
    });
}

function clearForm(formId) {
    document.getElementById(formId).reset();
    clearAllErrors();
}

window.authApp = {
    showLogin: showLogin,
    showResetPasswordForm: showResetPasswordForm,
    showVerificationPending: showVerificationPending
};