const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Configure Google OAuth Strategy
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

      // Check if user already exists
      let user = await User.findByEmail(email);

      if (!user) {
        // Create new user with Google account
        const username = email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);

        // Create user without password (Google OAuth)
        user = await User.createGoogleUser({
          email,
          fullName,
          username,
          googleId
        });
      } else {
        // Update Google ID if not set
        if (!user.google_id) {
          await User.updateGoogleId(user.id, googleId);
        }
      }

      return done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, null);
    }
  }
));

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
