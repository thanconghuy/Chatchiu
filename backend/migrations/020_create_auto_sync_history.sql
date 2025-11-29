-- Migration: Create auto_sync_history table
-- Purpose: Track all auto-sync operations and status changes
-- Date: 2025-11-29

-- Create auto_sync_history table
CREATE TABLE IF NOT EXISTS auto_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sync session info
  sync_type VARCHAR(50) NOT NULL, -- 'auto', 'manual', 'status_sync'
  sync_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sync_completed_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(20) NOT NULL, -- 'running', 'completed', 'failed'

  -- Sync parameters
  sync_days INTEGER,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,

  -- Results
  total_fetched INTEGER DEFAULT 0,
  total_created INTEGER DEFAULT 0,
  total_updated INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,

  -- Detailed results (JSON)
  details JSONB,

  -- Error info
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create auto_sync_change_log table (detailed changes)
CREATE TABLE IF NOT EXISTS auto_sync_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_history_id UUID REFERENCES auto_sync_history(id) ON DELETE CASCADE,

  -- Conversion info
  conversion_id UUID,
  at_conversion_id VARCHAR(255),
  order_code VARCHAR(255),
  user_id UUID,

  -- Change info
  change_type VARCHAR(50) NOT NULL, -- 'status_change', 'reconciliation_update', 'created', 'skipped'
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  old_reconciliation_status VARCHAR(50),
  new_reconciliation_status VARCHAR(50),

  -- Balance impact
  balance_change DECIMAL(15, 2),
  balance_operation VARCHAR(50), -- 'pending_to_available', 'reject_pending', etc.

  -- Metadata
  reason TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_auto_sync_history_sync_started_at
  ON auto_sync_history(sync_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_sync_history_sync_status
  ON auto_sync_history(sync_status);

CREATE INDEX IF NOT EXISTS idx_auto_sync_history_sync_type
  ON auto_sync_history(sync_type);

CREATE INDEX IF NOT EXISTS idx_auto_sync_change_log_sync_history_id
  ON auto_sync_change_log(sync_history_id);

CREATE INDEX IF NOT EXISTS idx_auto_sync_change_log_conversion_id
  ON auto_sync_change_log(conversion_id);

CREATE INDEX IF NOT EXISTS idx_auto_sync_change_log_user_id
  ON auto_sync_change_log(user_id);

CREATE INDEX IF NOT EXISTS idx_auto_sync_change_log_change_type
  ON auto_sync_change_log(change_type);

-- Add comment
COMMENT ON TABLE auto_sync_history IS 'Tracks all auto-sync operations from AccessTrade API';
COMMENT ON TABLE auto_sync_change_log IS 'Detailed log of changes made during each sync operation';

-- Migration complete
SELECT 'Migration 020: auto_sync_history tables created successfully' AS status;
