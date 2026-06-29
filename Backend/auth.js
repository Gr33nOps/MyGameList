const express = require('express');
const { createClient } = require('@supabase/supabase-js');

module.exports = (db, jwt, bcrypt, JWT_SECRET, verifyToken, checkBanned) => {
  const router = express.Router();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const publicSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  async function formatUser(sbUser, dbUser = null) {
    const meta = sbUser.user_metadata || {};

    if (!dbUser) {
      try {
        dbUser = await db('users').where({ id: sbUser.id }).first();
      } catch (_) {
        dbUser = null;
      }
    }

    return {
      id:           sbUser.id,
      email:        sbUser.email,
      username:     dbUser?.username     || meta.username     || sbUser.email.split('@')[0],
      display_name: dbUser?.display_name || meta.display_name || meta.username || sbUser.email.split('@')[0],
      avatar_url:   dbUser?.avatar_url   || meta.avatar_url   || null,
      is_admin:     dbUser?.is_admin     ?? meta.is_admin     ?? false,
      is_moderator: dbUser?.is_moderator ?? meta.is_moderator ?? false,
      is_banned:    dbUser?.is_banned    ?? meta.is_banned    ?? false,
      ban_reason:   dbUser?.ban_reason   || meta.ban_reason   || null,
    };
  }

  function issueJwt(userId, rememberMe = false) {
    const expiresIn = rememberMe ? '30d' : '7d';
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
  }

  router.post('/register', async (req, res) => {
    try {
      const { username, email, display_name, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const usernameTaken = existingUsers?.users?.some(
        u => u.user_metadata?.username?.toLowerCase() === username.toLowerCase()
      );

      if (usernameTaken) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      const { data, error: sbError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: display_name || username,
            is_admin:     false,
            is_moderator: false,
            is_banned:    false,
          },
          emailRedirectTo: `${frontendUrl}/auth.html`
        }
      });

      if (sbError) {
        if (sbError.message?.toLowerCase().includes('already registered')) {
          await supabase.auth.resend({ type: 'signup', email });
          return res.json({
            success: true,
            message: 'Account already registered. A new verification email has been sent.',
            email
          });
        }
        return res.status(400).json({ error: sbError.message });
      }

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        await supabase.auth.resend({ type: 'signup', email });
        return res.json({
          success: true,
          message: 'Account already registered. A new verification email has been sent.',
          email
        });
      }

      res.json({
        success: true,
        message: 'Account created! Please check your email to verify.',
        email
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/verify-email', async (req, res) => {
    try {
      const { code, token_hash } = req.body;
      const verificationToken = token_hash || code;

      if (!verificationToken) {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      let verifiedUser = null;

      for (const type of ['email', 'signup']) {
        const { data, error } = await publicSupabase.auth.verifyOtp({
          token_hash: verificationToken,
          type
        });
        if (!error && data?.user) {
          verifiedUser = data.user;
          break;
        }
      }

      if (!verifiedUser) {
        return res.status(400).json({
          error: 'Invalid or expired verification link. Please request a new verification email.'
        });
      }

      res.json({
        success: true,
        message: 'Email verified successfully! You can now log in.',
        user: {
          id:             verifiedUser.id,
          email:          verifiedUser.email,
          email_verified: true
        }
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/resend-verification', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const { error } = await supabase.auth.resend({ type: 'signup', email });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      res.json({ success: true, message: 'Verification email sent! Check your inbox and spam folder.' });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/check-username/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const exists = data?.users?.some(
        u => u.user_metadata?.username?.toLowerCase() === username.toLowerCase()
      );
      res.json({ exists: !!exists });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { emailOrUsername, password, rememberMe } = req.body;

      if (!emailOrUsername || !password) {
        return res.status(400).json({ error: 'Email/username and password are required' });
      }

      let email = emailOrUsername;

      if (!emailOrUsername.includes('@')) {
        const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const match = data?.users?.find(
          u => u.user_metadata?.username?.toLowerCase() === emailOrUsername.toLowerCase()
        );
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        email = match.email;
      }

      const { data: authData, error: authError } = await publicSupabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        if (
          authError.message?.includes('Email not confirmed') ||
          authError.code === 'email_not_confirmed'
        ) {
          return res.status(403).json({
            error: 'Please verify your email before logging in.',
            emailNotVerified: true,
            email
          });
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const sbUser = authData.user;

      if (!sbUser.email_confirmed_at) {
        return res.status(403).json({
          error: 'Please verify your email before logging in.',
          emailNotVerified: true,
          email: sbUser.email
        });
      }

      const dbUser = await db('users').where({ id: sbUser.id }).first();

      if (dbUser?.is_banned) {
        return res.status(403).json({
          error: 'Your account has been banned.',
          reason: dbUser.ban_reason || null
        });
      }

      const token = issueJwt(sbUser.id, rememberMe);

      res.json({ token, user: await formatUser(sbUser, dbUser) });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/verify', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(req.userId);
      if (error || !data?.user) return res.status(404).json({ error: 'User not found' });

      const dbUser = await db('users').where({ id: req.userId }).first();

      if (dbUser?.is_banned) {
        return res.status(403).json({ error: 'Your account has been banned.' });
      }

      res.json({ valid: true, user: await formatUser(data.user, dbUser) });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/me', verifyToken, async (req, res) => {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(req.userId);
      if (error || !data?.user) return res.status(404).json({ error: 'User not found' });

      const dbUser = await db('users').where({ id: req.userId }).first();

      res.json({ user: await formatUser(data.user, dbUser) });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${frontendUrl}/auth.html?type=recovery`
      });

      res.json({ success: true, message: 'If a matching account exists, a reset link has been sent.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reset-password', async (req, res) => {
    try {
      const { code, password } = req.body;

      if (!code || !password) {
        return res.status(400).json({ error: 'Code and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const { data: sessionData, error: exchangeError } = await publicSupabase.auth.exchangeCodeForSession(code);

      if (exchangeError || !sessionData?.user) {
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        sessionData.user.id,
        { password }
      );

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }

      res.json({ success: true, message: 'Password reset successfully!' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/logout', verifyToken, async (req, res) => {
    try {
      await publicSupabase.auth.signOut().catch(() => {});
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};