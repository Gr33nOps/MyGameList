const express = require('express');
const { createClient } = require('@supabase/supabase-js');

module.exports = (db, jwt, bcrypt, JWT_SECRET, verifyToken, checkBanned) => {
  const router = express.Router();

  // ─── Supabase Admin client (service-role key — server only) ───
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ─── Public Supabase client (for verification) ───
  const publicSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // ========================================
  // HELPERS
  // ========================================

  async function ensureLocalUser(supabaseUser, extraFields = {}) {
    const { id, email } = supabaseUser;

    const existing = await db('users')
      .where({ supabase_id: id })
      .first();

    if (!existing) {
      await db('users').insert({
        supabase_id: id,
        email: email,
        username: extraFields.username || email.split('@')[0],
        display_name: extraFields.display_name || extraFields.username || email.split('@')[0],
        email_verified: supabaseUser.email_confirmed_at ? true : false,
        is_admin: false,
        is_moderator: false,
        is_banned: false
      });
    } else {
      // Keep email_verified in sync with Supabase
      await db('users')
        .where({ supabase_id: id })
        .update({
          email_verified: supabaseUser.email_confirmed_at ? true : false,
          email: email
        });
    }
  }

  async function getLocalUser(supabaseId) {
    return await db('users')
      .where({ supabase_id: supabaseId })
      .first();
  }

  // ========================================
  // REGISTRATION - FIXED: Using signUp instead of inviteUserByEmail
  // ========================================
  router.post('/register', async (req, res) => {
    try {
      const { username, email, display_name, password } = req.body;

      // ── basic validation ──
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // ── username uniqueness (our table) ──
      const existingByUsername = await db('users')
        .where({ username })
        .first();
      
      if (existingByUsername) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // ── email uniqueness (our table) ──
      const existingByEmail = await db('users')
        .where({ email })
        .first();
      
      if (existingByEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      console.log('📝 Creating new user with signUp...');
      console.log('   Email:', email);
      console.log('   Username:', username);

      // ══════════════════════════════════════════════════════════════
      // ✅ USE signUp (not inviteUserByEmail)
      // This sends the "Confirm your signup" email template
      // ══════════════════════════════════════════════════════════════
      const { data, error: sbError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username,
            display_name: display_name || username
          },
          emailRedirectTo: `${frontendUrl}/auth.html`
        }
      });

      if (sbError) {
        console.error('❌ Supabase signUp error:', sbError);
        
        // Handle specific errors
        if (sbError.message.includes('already registered')) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        
        return res.status(400).json({ error: sbError.message });
      }

      if (!data.user) {
        console.error('❌ No user data returned from Supabase');
        return res.status(400).json({ error: 'Failed to create user' });
      }

      console.log('✅ Supabase user created:', data.user.id);
      console.log('   Email confirmed:', data.user.email_confirmed_at ? 'YES' : 'NO (pending)');

      // ── mirror in local users table ──
      await db('users').insert({
        supabase_id: data.user.id,
        email: email,
        username: username,
        display_name: display_name || username,
        email_verified: false, // Will be true after they click the confirmation link
        is_admin: false,
        is_moderator: false,
        is_banned: false
      });

      console.log('✅ Local user created');
      console.log('📧 Confirmation email sent automatically by Supabase');
      console.log('   Template: "Confirm your signup"');

      res.json({
        success: true,
        message: 'Account created! Please check your email to verify.',
        email
      });
    } catch (error) {
      console.error('💥 Registration error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // VERIFY EMAIL - FIXED: For signUp flow
  // ========================================
  router.post('/verify-email', async (req, res) => {
    try {
      const { code, token_hash } = req.body;
      
      console.log('\n🔍 ===== EMAIL VERIFICATION ATTEMPT =====');
      console.log('Received code:', code ? code.substring(0, 30) + '...' : 'NONE');
      console.log('Received token_hash:', token_hash ? token_hash.substring(0, 30) + '...' : 'NONE');

      const verificationToken = code || token_hash;

      if (!verificationToken) {
        console.error('❌ No verification token provided');
        return res.status(400).json({ error: 'Verification code is required' });
      }

      console.log('📤 Verifying email with Supabase...');
      
      // ══════════════════════════════════════════════════════════════
      // For signUp flow, use verifyOtp with type: 'email' or 'signup'
      // ══════════════════════════════════════════════════════════════
      const { data, error } = await publicSupabase.auth.verifyOtp({
        token_hash: verificationToken,
        type: 'email'  // This works for the "Confirm your signup" email
      });
      
      console.log('📥 Supabase verifyOtp response:');
      console.log('   Error:', error);
      console.log('   User exists:', !!data?.user);
      console.log('   Session exists:', !!data?.session);
      
      if (error) {
        console.error('❌ Verification failed:', error.message);
        
        // Try alternative type as fallback
        console.log('🔄 Trying with type: signup as fallback...');
        const { data: altData, error: altError } = await publicSupabase.auth.verifyOtp({
          token_hash: verificationToken,
          type: 'signup'
        });
        
        if (altError || !altData?.user) {
          console.error('❌ Fallback also failed:', altError?.message);
          return res.status(400).json({ 
            error: 'Invalid or expired verification link. Please request a new verification email.',
            details: altError?.message || error.message
          });
        }
        
        // Fallback succeeded
        console.log('✅ Verification successful via signup type');
        await ensureLocalUser(altData.user, {
          username: altData.user.user_metadata?.username,
          display_name: altData.user.user_metadata?.display_name
        });
        
        return res.json({
          success: true,
          message: 'Email verified successfully!',
          user: {
            id: altData.user.id,
            email: altData.user.email,
            email_verified: true
          }
        });
      }

      if (!data?.user) {
        console.error('❌ No user data in response');
        return res.status(400).json({ error: 'Verification failed - no user data' });
      }

      // ✅ Verification successful
      console.log('✅ Email verified for user:', data.user.email);
      console.log('   User ID:', data.user.id);
      console.log('   Email confirmed at:', data.user.email_confirmed_at);
      
      // Sync to local database and mark as verified
      await ensureLocalUser(data.user, {
        username: data.user.user_metadata?.username,
        display_name: data.user.user_metadata?.display_name
      });
      
      console.log('✅ Local user synced and marked as verified');

      res.json({
        success: true,
        message: 'Email verified successfully!',
        user: {
          id: data.user.id,
          email: data.user.email,
          email_verified: true
        }
      });
    } catch (error) {
      console.error('💥 Email verification exception:', error);
      console.error('Stack trace:', error.stack);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // RESEND VERIFICATION EMAIL
  // ========================================
  router.post('/resend-verification', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      console.log('📧 Resending verification email to:', email);

      // Use the resend method
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });

      if (error) {
        console.error('Resend verification error:', error);
        return res.status(400).json({ error: error.message });
      }

      console.log('✅ Verification email resent to:', email);

      res.json({ 
        success: true, 
        message: 'Verification email sent! Please check your inbox and spam folder.' 
      });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // CHECK USERNAME AVAILABILITY
  // ========================================
  router.get('/check-username/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const user = await db('users')
        .where({ username })
        .first();
      
      res.json({ exists: !!user });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // LOGIN
  // ========================================
  router.post('/login', async (req, res) => {
    try {
      const { emailOrUsername, password, rememberMe } = req.body;

      if (!emailOrUsername || !password) {
        return res.status(400).json({ error: 'Email/username and password are required' });
      }

      // ── resolve username → email if needed ──
      let email = emailOrUsername;
      if (!emailOrUsername.includes('@')) {
        const user = await db('users')
          .where({ username: emailOrUsername })
          .first();
        
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        email = user.email;
      }

      console.log('🔐 Login attempt for:', email);

      // ── authenticate via Supabase ──
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        console.error('Supabase auth error:', authError);
        
        // Better error handling for unverified emails
        if (authError.message.includes('Email not confirmed') || authError.code === 'email_not_confirmed') {
          return res.status(403).json({
            error: 'Please verify your email before logging in. Check your inbox for the verification link.',
            emailNotVerified: true,
            email: email
          });
        }
        
        return res.status(401).json({ error: authError.message });
      }

      const sbUser = authData.user;

      // ── explicit verified check (belt and suspenders) ──
      if (!sbUser.email_confirmed_at) {
        console.log('⚠️ Email not confirmed for:', sbUser.email);
        return res.status(403).json({
          error: 'Please verify your email before logging in. Check your inbox for the verification link.',
          emailNotVerified: true,
          email: sbUser.email
        });
      }

      // ── sync local row & fetch it ──
      await ensureLocalUser(sbUser);
      const localUser = await getLocalUser(sbUser.id);

      if (!localUser) {
        return res.status(500).json({ error: 'User sync error' });
      }

      // ── ban check ──
      if (localUser.is_banned) {
        return res.status(403).json({
          error: 'Your account has been banned',
          bannedAt: localUser.banned_at,
          reason: localUser.ban_reason
        });
      }

      // ── update last_login ──
      await db('users')
        .where({ id: localUser.id })
        .update({ last_login: db.fn.now() });

      // ── issue our own JWT ──
      const expiresIn = rememberMe ? '30d' : '7d';
      const token = jwt.sign({ userId: localUser.id }, JWT_SECRET, { expiresIn });

      // ── store session row ──
      const sessionExpires = new Date(
        Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000
      );
      
      await db('sessions').insert({
        user_id: localUser.id,
        session_token: token,
        expires_at: sessionExpires,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      console.log('✅ Login successful for:', email);

      res.json({
        token,
        refreshToken: null,
        user: {
          id: localUser.id,
          username: localUser.username,
          email: localUser.email,
          display_name: localUser.display_name,
          avatar_url: localUser.avatar_url,
          is_moderator: localUser.is_moderator || false,
          is_admin: localUser.is_admin || false
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // VERIFY TOKEN
  // ========================================
  router.get('/verify', verifyToken, checkBanned, async (req, res) => {
    try {
      const user = await db('users')
        .select('id', 'username', 'email', 'display_name', 'avatar_url', 'is_moderator', 'is_admin')
        .where({ id: req.userId })
        .first();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ valid: true, user });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // GET CURRENT USER - FIXED ENDPOINT PATH
  // ========================================
  router.get('/me', verifyToken, checkBanned, async (req, res) => {
    try {
      console.log('📍 /me endpoint called, userId:', req.userId);
      
      const user = await db('users')
        .select('id', 'username', 'email', 'display_name', 'avatar_url', 'is_moderator', 'is_admin')
        .where({ id: req.userId })
        .first();

      if (!user) {
        console.error('❌ User not found for userId:', req.userId);
        return res.status(404).json({ error: 'User not found' });
      }

      console.log('✅ User found:', user.username);
      res.json({ user });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // FORGOT PASSWORD
  // ========================================
  router.post('/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${frontendUrl}/auth.html?type=recovery`
      });

      if (error) {
        console.error('Forgot password supabase error:', error);
      }

      res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // RESET PASSWORD
  // ========================================
  router.post('/reset-password', async (req, res) => {
    try {
      const { code, password } = req.body;

      if (!code || !password) {
        return res.status(400).json({ error: 'Code and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // ── exchange the code for a session ──
      const { data: sessionData, error: exchangeError } = await publicSupabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError || !sessionData?.user) {
        console.error('Exchange code error:', exchangeError);
        return res.status(400).json({ error: 'Invalid or expired reset link.' });
      }

      // ── update password using the admin client ──
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        sessionData.user.id,
        { password }
      );

      if (updateError) {
        console.error('Update password error:', updateError);
        return res.status(400).json({ error: updateError.message });
      }

      // ── invalidate all app sessions ──
      const localUser = await getLocalUser(sessionData.user.id);
      if (localUser) {
        await db('sessions')
          .where({ user_id: localUser.id })
          .delete();
      }

      res.json({ success: true, message: 'Password reset successfully!' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ========================================
  // LOGOUT
  // ========================================
  router.post('/logout', verifyToken, async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      await db('sessions')
        .where({ session_token: token })
        .delete();

      try {
        await supabase.auth.signOut();
      } catch (_) { /* ignore */ }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
};