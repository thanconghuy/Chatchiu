-- Add Neon Auth ID to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS neon_auth_id VARCHAR(255) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_neon_auth_id ON users(neon_auth_id);

-- Add comment
COMMENT ON COLUMN users.neon_auth_id IS 'Neon Auth (Stack Auth) user ID for authentication';
