#!/bin/bash

# =====================================================
# Setup Test Database for Local Testing
# =====================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DB_USER="${DB_USER:-postgres}"
PROD_DB="${PROD_DB:-chatchiu}"
TEST_DB="${TEST_DB:-chatchiu_test}"

log_info "Setting up test database: $TEST_DB"

# Drop test database if exists
log_info "Dropping existing test database (if any)..."
psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true

# Create test database
log_info "Creating test database..."
psql -U "$DB_USER" -c "CREATE DATABASE $TEST_DB;"

# Copy schema from production
log_info "Copying schema from $PROD_DB to $TEST_DB..."
pg_dump -U "$DB_USER" -s "$PROD_DB" | psql -U "$DB_USER" "$TEST_DB"

# Copy system settings and essential data
log_info "Copying system settings..."
psql -U "$DB_USER" -c "
  INSERT INTO $TEST_DB.system_settings
  SELECT * FROM $PROD_DB.system_settings;
" 2>/dev/null || {
  log_info "Copying via pg_dump..."
  pg_dump -U "$DB_USER" -t system_settings -a "$PROD_DB" | psql -U "$DB_USER" "$TEST_DB"
}

# Create test users
log_info "Creating test users..."
psql -U "$DB_USER" -d "$TEST_DB" << 'EOF'
-- Test user 1
INSERT INTO users (email, username, password_hash, full_name, is_admin)
VALUES (
  'testuser1@example.com',
  'testuser1',
  '$2b$10$abcdefghijklmnopqrstuv',  -- dummy hash
  'Test User 1',
  false
) ON CONFLICT (email) DO NOTHING;

-- Test user 2
INSERT INTO users (email, username, password_hash, full_name, is_admin)
VALUES (
  'testuser2@example.com',
  'testuser2',
  '$2b$10$abcdefghijklmnopqrstuv',
  'Test User 2',
  false
) ON CONFLICT (email) DO NOTHING;

-- Test admin
INSERT INTO users (email, username, password_hash, full_name, is_admin)
VALUES (
  'admin@example.com',
  'admin',
  '$2b$10$abcdefghijklmnopqrstuv',
  'Admin User',
  true
) ON CONFLICT (email) DO NOTHING;
EOF

log_success "Test database created successfully!"
log_info "Test database name: $TEST_DB"
log_info "Test users created:"
log_info "  - testuser1@example.com"
log_info "  - testuser2@example.com"
log_info "  - admin@example.com"

echo ""
log_info "Next steps:"
echo "1. Create .env.test file with TEST_DB configuration"
echo "2. Run: npm run test:local"
