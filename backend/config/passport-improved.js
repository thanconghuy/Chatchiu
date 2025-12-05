const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const PendingOAuthLink = require('../models/PendingOAuthLink');
const { generateUniqueUsername } = require('../utils/usernameGenerator');
const logger = require('../utils/logger');

// Configure Google OAuth Strategy only if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
    },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Extract user info from Google profile
      const email = profile.emails[0].value;
      const fullName = profile.displayName;
      const googleId = profile.id;
      const profilePicture = profile.photos && profile.photos.length > 0
        ? profile.photos[0].value : null;

      logger.info('Google OAuth attempt', { email, googleId });

      // Check if user already exists
      let user = await User.findByEmail(email);

      if (!user) {
        // =========================================
        // CASE 1: NEW USER - Create account
        // =========================================
        logger.info('Creating new user via Google OAuth', { email });

        // Generate user-friendly username
        const username = await generateUniqueUsername(email, fullName);

        user = await User.createGoogleUser({
          email,
          fullName,
          username,
          googleId,
          profilePicture
        });

        logger.success('New user created via Google OAuth', {
          userId: user.id,
          email: user.email,
          username: user.username
        });

        return done(null, user);

      } else if (user.google_id) {
        // =========================================
        // CASE 2: EXISTING GOOGLE USER - Just login
        // =========================================
        logger.info('Existing Google user login', { userId: user.id, email });

        // Update profile picture if changed
        if (profilePicture && profilePicture !== user.profile_picture) {
          await User.updateGoogleId(user.id, googleId, profilePicture);
        }

        return done(null, user);

      } else {
        // =========================================
        // CASE 3: EXISTING PASSWORD USER - Require confirmation
        // =========================================
        logger.warn('Account linking required', {
          userId: user.id,
          email,
          hasPassword: !!user.password_hash
        });

        // Create pending OAuth link
        const pendingLink = await PendingOAuthLink.create(
          user.id,
          'google',
          googleId,
          {
            email,
            fullName,
            profilePicture
          }
        );

        logger.info('Pending OAuth link created', {
          userId: user.id,
          token: pendingLink.token.substring(0, 8) + '...'
        });

        // Return special error to indicate linking required
        const error = new Error('ACCOUNT_LINKING_REQUIRED');
        error.userId = user.id;
        error.email = email;
        error.token = pendingLink.token;
        error.hasPassword = !!user.password_hash;

        return done(error, null);
      }

    } catch (error) {
      logger.error('Google OAuth error', {
        error: error.message,
        stack: error.stack
      });
      return done(error, null);
    }
  }
  ));
} else {
  logger.warn('Google OAuth credentials not configured. Google login will not be available.');
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
