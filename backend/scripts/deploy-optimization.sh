#!/bin/bash

# =====================================================
# Payment Module Optimization Deployment Script
# Created: 2026-01-02
# =====================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
DB_NAME="${DB_NAME:-chatchiu}"
DB_USER="${DB_USER:-postgres}"
PHASE="${1:-indexes}"  # Default to indexes phase

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "Created backup directory: $BACKUP_DIR"
    fi
}

# Backup database
backup_database() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/chatchiu_before_optimization_${timestamp}.sql"

    log_info "Creating database backup..."

    if pg_dump -U "$DB_USER" "$DB_NAME" > "$backup_file"; then
        log_success "Database backed up to: $backup_file"
        echo "$backup_file" > "$BACKUP_DIR/latest_backup.txt"
    else
        log_error "Database backup failed!"
        exit 1
    fi
}

# Phase 1: Apply database indexes
phase_1_indexes() {
    log_info "Phase 1: Applying database indexes..."

    # Backup first
    backup_database

    # Apply indexes
    log_info "Applying index migration..."
    if psql -U "$DB_USER" -d "$DB_NAME" -f backend/database/migrations/optimize-payment-indexes.sql; then
        log_success "Indexes applied successfully!"
    else
        log_error "Failed to apply indexes!"
        exit 1
    fi

    # Verify indexes
    log_info "Verifying indexes..."
    psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            tablename,
            indexname,
            indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
            AND tablename LIKE '%payment%'
        ORDER BY tablename, indexname;
    "

    log_success "Phase 1 completed!"
    log_warning "Monitor index usage for 24-48 hours before proceeding to Phase 2"
}

# Phase 2: Deploy optimized service with feature flag
phase_2_service() {
    log_info "Phase 2: Deploying optimized service..."

    # Backup current code
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local code_backup="$BACKUP_DIR/code_backup_${timestamp}.tar.gz"

    log_info "Backing up current code..."
    tar -czf "$code_backup" backend/services/paymentRequestService.js backend/routes/paymentRequest.js
    log_success "Code backed up to: $code_backup"

    # Check if .env exists
    if [ ! -f .env ]; then
        log_error ".env file not found!"
        exit 1
    fi

    # Add feature flag to .env if not exists
    if ! grep -q "USE_OPTIMIZED_PAYMENT_SERVICE" .env; then
        echo "USE_OPTIMIZED_PAYMENT_SERVICE=false" >> .env
        log_info "Added USE_OPTIMIZED_PAYMENT_SERVICE to .env (default: false)"
    fi

    log_success "Phase 2 setup completed!"
    log_warning "To enable optimized service, set USE_OPTIMIZED_PAYMENT_SERVICE=true in .env"
    log_warning "Start with 10% traffic and monitor for 24 hours"
}

# Phase 3: Full rollout
phase_3_rollout() {
    log_info "Phase 3: Full rollout of optimized service..."

    # Update .env
    if grep -q "USE_OPTIMIZED_PAYMENT_SERVICE=false" .env; then
        sed -i 's/USE_OPTIMIZED_PAYMENT_SERVICE=false/USE_OPTIMIZED_PAYMENT_SERVICE=true/' .env
        log_success "Enabled optimized service in .env"
    else
        log_warning "Optimized service already enabled or not configured in .env"
    fi

    # Restart application
    log_info "Restarting application..."
    if command -v pm2 &> /dev/null; then
        pm2 restart chatchiu-api
        log_success "Application restarted with PM2"
    else
        log_warning "PM2 not found. Please restart your application manually."
    fi

    log_success "Phase 3 completed!"
    log_info "Monitor logs and performance metrics"
}

# Rollback function
rollback() {
    log_warning "Starting rollback process..."

    # Get latest backup
    if [ -f "$BACKUP_DIR/latest_backup.txt" ]; then
        local backup_file=$(cat "$BACKUP_DIR/latest_backup.txt")

        log_info "Restoring database from: $backup_file"
        if psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"; then
            log_success "Database restored successfully"
        else
            log_error "Database restore failed!"
            exit 1
        fi
    else
        log_error "No backup file found!"
        exit 1
    fi

    # Disable optimized service
    if grep -q "USE_OPTIMIZED_PAYMENT_SERVICE=true" .env; then
        sed -i 's/USE_OPTIMIZED_PAYMENT_SERVICE=true/USE_OPTIMIZED_PAYMENT_SERVICE=false/' .env
        log_success "Disabled optimized service in .env"
    fi

    # Restart application
    if command -v pm2 &> /dev/null; then
        pm2 restart chatchiu-api
        log_success "Application restarted"
    fi

    log_success "Rollback completed!"
}

# Test function
test_optimization() {
    log_info "Running tests for optimized service..."

    if [ -f "package.json" ]; then
        npm test -- backend/tests/paymentRequestService.optimized.test.js
    else
        log_error "package.json not found!"
        exit 1
    fi
}

# Monitor index usage
monitor_indexes() {
    log_info "Checking index usage statistics..."

    psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            schemaname,
            tablename,
            indexname,
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
            AND (tablename LIKE '%payment%' OR tablename LIKE '%reconciliation%')
        ORDER BY idx_scan DESC;
    "

    log_info "Checking for unused indexes (scans = 0)..."
    psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            schemaname,
            tablename,
            indexname,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
            AND (tablename LIKE '%payment%' OR tablename LIKE '%reconciliation%')
            AND idx_scan = 0
        ORDER BY pg_relation_size(indexrelid) DESC;
    "
}

# Main execution
main() {
    create_backup_dir

    case "$PHASE" in
        "indexes"|"1")
            phase_1_indexes
            ;;
        "service"|"2")
            phase_2_service
            ;;
        "rollout"|"3")
            phase_3_rollout
            ;;
        "rollback")
            rollback
            ;;
        "test")
            test_optimization
            ;;
        "monitor")
            monitor_indexes
            ;;
        *)
            log_error "Unknown phase: $PHASE"
            echo ""
            echo "Usage: $0 [phase]"
            echo ""
            echo "Available phases:"
            echo "  indexes  (or 1) - Apply database indexes"
            echo "  service  (or 2) - Deploy optimized service with feature flag"
            echo "  rollout  (or 3) - Full rollout of optimized service"
            echo "  test            - Run test suite"
            echo "  monitor         - Check index usage"
            echo "  rollback        - Rollback to previous version"
            echo ""
            exit 1
            ;;
    esac
}

main
