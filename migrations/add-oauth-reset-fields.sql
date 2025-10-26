-- Add Google OAuth and password reset fields to users table

-- Add google_id column
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Add password reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Add comment
COMMENT ON COLUMN users.google_id IS 'Google OAuth ID for social login';
COMMENT ON COLUMN users.reset_token IS 'Password reset token';
COMMENT ON COLUMN users.reset_token_expiry IS 'Password reset token expiry time';
