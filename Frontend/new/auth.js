// Configuration - FIXED: Use relative path since we're on same origin
const API_BASE = '/api';  // Simple relative path - no origin needed

// Global state
let pendingEmail = '';

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Auth page loaded');
    console.log('📍 API Base URL:', API_BASE);
    await checkExistingSession();
    await handleUrlParams();
    initializeAuthUI();
});

// ========================================
// URL PARAMETER HANDLING - FIXED FOR SIGNUP FLOW
// ========================================

async function handleUrlParams() {
    console.log('📋 Checking URL parameters...');
    console.log('   Full URL:', window.location.href);
    console.log('   Search params:', window.location.search);
    console.log('   Hash params:', window.location.hash);
    
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    
    // Extract all possible parameters
    const code = urlParams.get('code') || hashParams.get('code');
    const tokenHash = urlParams.get('token_hash') || hashParams.get('token_hash');
    const type = urlParams.get('type') || hashParams.get('type');
    const error = urlParams.get('error') || hashParams.get('error');
    const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');
    
    console.log('   Extracted params:', { 
        code: code ? code.substring(0, 20) + '...' : 'NONE',
        token_hash: tokenHash ? tokenHash.substring(0, 20) + '...' : 'NONE',
        type, 
        error, 
        errorDescription 
    });
    
    // Handle errors
    if (error) {
        console.error('❌ Supabase error:', error, errorDescription);
        showVerificationError(errorDescription || error);
        return;
    }
    
    // Handle email verification (signup or email type)
    if (type === 'signup' || type === 'email') {
        console.log('📧 Email verification flow detected (type:', type, ')');
        const verificationToken = tokenHash || code;
        
        if (verificationToken) {
            console.log('✅ Verification token found, starting verification...');
            await handleEmailVerification(verificationToken);
        } else {
            console.log('⚠️ No verification token found');
        }
    }
    // Handle password reset
    else if (type === 'recovery' && code) {
        console.log('🔑 Password recovery flow detected');
        window._resetCode = code;
        showNewPasswordForm();
    } else {
        console.log('ℹ️ No special URL parameters detected - showing normal auth page');
    }
}

// Handle email verification (for standard signup flows)
async function handleEmailVerification(token) {
    console.log('🔄 Starting email verification process...');
    console.log('   Token:', token.substring(0, 20) + '...');
    
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationStatus').classList.remove('hidden');
    
    try {
        console.log('📤 Sending verification request to backend...');
        
        const requestBody = {
            token_hash: token,
            code: token
        };
        
        console.log('   Request body: { token_hash: PROVIDED, code: PROVIDED }');
        
        const response = await fetch(`${API_BASE}/auth/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Response status:', response.status, response.statusText);
        
        const data = await response.json();
        console.log('📥 Response data:', data);
        
        if (response.ok) {
            console.log('✅ Verification successful!');
            showVerificationSuccess();
            setTimeout(() => {
                console.log('🧹 Cleaning URL...');
                window.history.replaceState({}, document.title, '/auth.html');
            }, 2000);
        } else {
            console.error('❌ Verification failed:', data.error);
            showVerificationError(data.error || 'Verification failed');
        }
    } catch (error) {
        console.error('💥 Network error during verification:', error);
        showVerificationError('Network error during verification. Please try again.');
    }
}

function showVerificationError(message) {
    console.log('❌ Showing verification error:', message);
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationErrorMessage').textContent = message;
    document.getElementById('verificationError').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Verification Failed';
}

// ========================================
// SESSION MANAGEMENT
// ========================================

async function checkExistingSession() {
    const token = localStorage.getItem('authToken');
    console.log('🔐 Checking existing session:', token ? 'Token exists' : 'No token');

    if (token) {
        try {
            const response = await fetch(`${API_BASE}/auth/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                console.log('✅ Valid session found, redirecting to home...');
                window.location.href = 'home.html';
            } else {
                console.log('⚠️ Invalid session, clearing...');
                clearSession();
            }
        } catch (error) {
            console.error('Session check error:', error);
            clearSession();
        }
    }
}

function clearSession() {
    console.log('🧹 Clearing session data');
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('lastActivity');
}

// ========================================
// UI INITIALIZATION
// ========================================

function initializeAuthUI() {
    console.log('🎨 Initializing auth UI...');
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Password visibility toggles
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            togglePasswordVisibility(btn.dataset.target);
        });
    });

    // Password strength checkers
    document.getElementById('regPassword')?.addEventListener('input', (e) => {
        checkPasswordStrength(e.target.value, 'strengthFill', 'strengthText');
    });

    document.getElementById('newPassword')?.addEventListener('input', (e) => {
        checkPasswordStrength(e.target.value, 'newPasswordStrengthFill', 'newPasswordStrengthText');
    });

    // Form submissions
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('resetPasswordForm').addEventListener('submit', handlePasswordReset);
    document.getElementById('newPasswordForm').addEventListener('submit', handleNewPassword);

    // Additional actions
    document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
        e.preventDefault();
        showResetPasswordForm();
    });

    document.getElementById('backToLogin').addEventListener('click', showLogin);
    document.getElementById('resendVerification')?.addEventListener('click', resendVerificationEmail);
    document.getElementById('resendFromError')?.addEventListener('click', resendVerificationEmail);
    document.getElementById('changeEmail')?.addEventListener('click', () => {
        hideAllViews();
        switchTab('register');
    });

    // Real-time validation
    document.getElementById('regUsername').addEventListener('blur', validateUsername);
    document.getElementById('regEmail').addEventListener('blur', validateEmail);
    document.getElementById('regConfirmPassword').addEventListener('input', validatePasswordMatch);
    document.getElementById('confirmNewPassword')?.addEventListener('input', () => {
        validatePasswordMatch('newPassword', 'confirmNewPassword');
    });
    
    console.log('✅ Auth UI initialized');
}

// ========================================
// VIEW SWITCHING
// ========================================

function hideAllViews() {
    document.querySelectorAll('.auth-form').forEach(el => {
        el.classList.remove('active');
    });

    document.querySelectorAll(
        '#verificationPending, #verificationStatus, #verificationSuccess, #verificationError, #successPanel'
    ).forEach(el => {
        el.classList.add('hidden');
    });

    document.getElementById('authTabs').style.display = 'flex';
}

function switchTab(tab) {
    console.log('📑 Switching to tab:', tab);
    hideAllViews();
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    clearAllErrors();

    if (tab === 'login') {
        const form = document.getElementById('loginForm');
        form.classList.remove('hidden');
        form.classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        clearForm('loginForm');
    } else if (tab === 'register') {
        const form = document.getElementById('registerForm');
        form.classList.remove('hidden');
        form.classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        clearForm('registerForm');
    }
}

function showLogin() {
    console.log('🔑 Showing login form');
    hideAllViews();
    switchTab('login');
    document.getElementById('authSubtitle').textContent = 'Track and discover your favorite games';
}

function showResetPasswordForm() {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    const form = document.getElementById('resetPasswordForm');
    form.classList.remove('hidden');
    form.classList.add('active');
    document.getElementById('authSubtitle').textContent = 'Reset Your Password';
}

function showNewPasswordForm() {
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    const form = document.getElementById('newPasswordForm');
    form.classList.remove('hidden');
    form.classList.add('active');
    document.getElementById('authSubtitle').textContent = 'Create New Password';
}

function showVerificationPending(email) {
    console.log('📧 Showing verification pending for:', email);
    hideAllViews();
    pendingEmail = email;
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationEmail').textContent = email;
    document.getElementById('verificationPending').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Email Verification';
}

function showVerificationSuccess() {
    console.log('✅ Showing verification success');
    hideAllViews();
    document.getElementById('authTabs').style.display = 'none';
    document.getElementById('verificationSuccess').classList.remove('hidden');
    document.getElementById('authSubtitle').textContent = 'Email Verified';
}

// ========================================
// LOGIN HANDLER
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    console.log('🔐 Login attempt started');

    const emailOrUsername = document.getElementById('loginEmail').value.trim();
    const password        = document.getElementById('loginPassword').value;
    const rememberMe      = document.getElementById('rememberMe').checked;
    const errorDiv        = document.getElementById('loginError');
    const successDiv      = document.getElementById('loginSuccess');
    const btn             = document.getElementById('loginBtn');

    console.log('   Email/Username:', emailOrUsername);
    console.log('   Remember me:', rememberMe);

    clearError(errorDiv);
    clearError(successDiv);
    setButtonLoading(btn, true);

    if (!emailOrUsername || !password) {
        showError(errorDiv, 'Please enter both email/username and password.');
        setButtonLoading(btn, false);
        return;
    }

    try {
        console.log('📤 Sending login request to:', `${API_BASE}/auth/login`);
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailOrUsername, password, rememberMe })
        });

        console.log('📥 Login response status:', response.status);
        const data = await response.json();
        console.log('📥 Login response data:', data);

        if (response.ok) {
            console.log('✅ Login successful!');
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            localStorage.setItem('lastActivity', Date.now().toString());

            showSuccess(successDiv, 'Login successful! Redirecting...');

            setTimeout(() => {
                window.location.href = 'home.html';
            }, 500);
        } else {
            console.error('❌ Login failed:', data.error);
            
            if (data.emailNotVerified && data.email) {
                console.log('⚠️ Email not verified, showing resend option');
                pendingEmail = data.email;
                showError(errorDiv, data.error + ' Would you like to resend the verification email?');
                
                const resendBtn = document.createElement('button');
                resendBtn.textContent = 'Resend Verification Email';
                resendBtn.className = 'btn btn-secondary';
                resendBtn.style.marginTop = '10px';
                resendBtn.style.width = '100%';
                resendBtn.onclick = async (e) => {
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
        console.error('💥 Login network error:', error);
        showError(errorDiv, 'Network error. Please check server is running and try again.');
        setButtonLoading(btn, false);
    }
}

// ========================================
// REGISTER HANDLER
// ========================================

async function handleRegister(e) {
    e.preventDefault();
    console.log('📝 Registration attempt started');

    const email           = document.getElementById('regEmail').value.trim();
    const username        = document.getElementById('regUsername').value.trim();
    const displayName     = document.getElementById('regDisplayName').value.trim();
    const password        = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const agreeTerms      = document.getElementById('agreeTerms').checked;
    const errorDiv        = document.getElementById('registerError');
    const btn             = document.getElementById('registerBtn');

    console.log('   Email:', email);
    console.log('   Username:', username);
    console.log('   Display name:', displayName);

    clearError(errorDiv);
    setButtonLoading(btn, true);

    const validation = validateRegistration(email, username, displayName, password, confirmPassword, agreeTerms);

    if (!validation.valid) {
        console.log('❌ Validation failed:', validation.error);
        showError(errorDiv, validation.error);
        setButtonLoading(btn, false);
        return;
    }

    try {
        console.log('📤 Sending registration request to:', `${API_BASE}/auth/register`);
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, display_name: displayName, password })
        });

        console.log('📥 Registration response status:', response.status);
        const data = await response.json();
        console.log('📥 Registration response data:', data);

        if (response.ok) {
            console.log('✅ Registration successful!');
            showVerificationPending(email);
        } else {
            console.error('❌ Registration failed:', data.error);
            showError(errorDiv, data.error || 'Registration failed. Please try again.');
        }

        setButtonLoading(btn, false);
    } catch (error) {
        console.error('💥 Registration network error:', error);
        showError(errorDiv, 'Network error. Please check server is running and try again.');
        setButtonLoading(btn, false);
    }
}

// ========================================
// RESEND VERIFICATION EMAIL
// ========================================

async function resendVerificationEmail() {
    console.log('📧 Resending verification email to:', pendingEmail);
    
    const btn          = event?.target || document.getElementById('resendVerification');
    const originalText = btn.textContent;

    if (!pendingEmail) {
        alert('No email found. Please try registering again.');
        return;
    }

    btn.disabled     = true;
    btn.textContent  = 'Sending...';

    try {
        console.log('📤 Sending resend request...');
        const response = await fetch(`${API_BASE}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail })
        });

        console.log('📥 Resend response status:', response.status);
        const data = await response.json();
        console.log('📥 Resend response data:', data);

        if (response.ok) {
            console.log('✅ Resend successful');
            alert('Verification email sent! Please check your inbox and spam folder.');
        } else {
            console.error('❌ Resend failed:', data.error);
            alert(data.error || 'Failed to resend email.');
        }
    } catch (error) {
        console.error('💥 Resend network error:', error);
        alert('Network error. Please try again.');
    } finally {
        btn.disabled    = false;
        btn.textContent = originalText;
    }
}

// ========================================
// FORGOT PASSWORD
// ========================================

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
        const response = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        showSuccess(successDiv, 'If a matching account exists, a reset link has been sent.');
        document.getElementById('resetEmail').value = '';
        setButtonLoading(btn, false);
    } catch (error) {
        console.error('Password reset error:', error);
        showError(errorDiv, 'Network error. Please try again.');
        setButtonLoading(btn, false);
    }
}

// ========================================
// SET NEW PASSWORD
// ========================================

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
        console.error('Reset password error:', error);
        showError(errorDiv, 'Network error. Please try again.');
        setButtonLoading(btn, false);
    }
}

// ========================================
// VALIDATION FUNCTIONS
// ========================================

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

    const strength = getPasswordStrength(password);
    if (strength < 2) {
        return { valid: false, error: 'Password is too weak. Please use a stronger password.' };
    }

    if (!agreeTerms) {
        return { valid: false, error: 'You must agree to the Terms of Service and Privacy Policy.' };
    }

    return { valid: true };
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
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

async function validateEmail() {
    const input = document.getElementById('regEmail');
    const email = input.value.trim();

    input.setCustomValidity(isValidEmail(email) ? '' : 'Please enter a valid email address');
}

function validatePasswordMatch(passwordId = 'regPassword', confirmId = 'regConfirmPassword') {
    const password        = document.getElementById(passwordId).value;
    const confirmPassword = document.getElementById(confirmId);

    if (confirmPassword.value && password !== confirmPassword.value) {
        confirmPassword.setCustomValidity('Passwords do not match');
    } else {
        confirmPassword.setCustomValidity('');
    }
}

// ========================================
// PASSWORD STRENGTH CHECKER
// ========================================

function checkPasswordStrength(password, fillId, textId) {
    const strength     = getPasswordStrength(password);
    const strengthFill = document.getElementById(fillId);
    const strengthText = document.getElementById(textId);

    const levels  = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors  = ['#ff4444', '#ff8800', '#ffbb00', '#88cc00', '#00cc44'];
    const widths  = ['20%', '40%', '60%', '80%', '100%'];

    strengthFill.style.width           = widths[strength];
    strengthFill.style.backgroundColor = colors[strength];
    strengthText.textContent           = `Password strength: ${levels[strength]}`;
}

function getPasswordStrength(password) {
    let strength = 0;

    if (password.length >= 8)  strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password))   strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    return Math.min(strength, 4);
}

// ========================================
// UI HELPER FUNCTIONS
// ========================================

function togglePasswordVisibility(inputId) {
    const input  = document.getElementById(inputId);
    const button = document.querySelector(`[data-target="${inputId}"]`);

    if (input.type === 'password') {
        input.type      = 'text';
        button.textContent = '👁️‍🗨️';
    } else {
        input.type      = 'password';
        button.textContent = '👁️';
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
    document.querySelectorAll('.error, .success').forEach(el => {
        clearError(el);
    });
}

function clearForm(formId) {
    document.getElementById(formId).reset();
    clearAllErrors();
}

// Export for global access
window.authApp = {
    showLogin,
    showResetPasswordForm,
    showVerificationPending
};

console.log('✅ Auth script loaded successfully');