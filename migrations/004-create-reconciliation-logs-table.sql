-- Migration: Create reconciliation_logs table
-- Description: Tạo bảng audit trail cho các thao tác trên kỳ đối soát
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation

-- Create reconciliation_logs table
CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE CASCADE,

  -- Action information
  action VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Additional context
  notes TEXT,
  metadata JSONB,

  -- Constraints
  CONSTRAINT check_action CHECK (action IN (
    'created',
    'confirmed',
    'paid',
    'cancelled',
    'rerun',
    'status_changed',
    'notes_updated'
  ))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_reconciliation_id
  ON reconciliation_logs(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_performed_by
  ON reconciliation_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_performed_at
  ON reconciliation_logs(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_action
  ON reconciliation_logs(action);

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_metadata
  ON reconciliation_logs USING GIN (metadata);

-- Add comments
COMMENT ON TABLE reconciliation_logs IS 'Bảng lưu lịch sử các thao tác trên kỳ đối soát (audit trail)';
COMMENT ON COLUMN reconciliation_logs.action IS 'Loại thao tác: created, confirmed, paid, cancelled, rerun, etc.';
COMMENT ON COLUMN reconciliation_logs.performed_by IS 'User thực hiện thao tác (thường là admin)';
COMMENT ON COLUMN reconciliation_logs.metadata IS 'Dữ liệu bổ sung dạng JSON: {old_status, new_status, reason, bank_ref, etc.}';

-- Function to automatically log reconciliation actions
CREATE OR REPLACE FUNCTION log_reconciliation_action()
RETURNS TRIGGER AS $$
DECLARE
  action_type VARCHAR(50);
  admin_id UUID;
  meta JSONB;
BEGIN
  -- Determine action type based on trigger operation and status change
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
    admin_id := NEW.created_by;
    meta := jsonb_build_object(
      'status', NEW.status,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'period_label', NEW.period_label,
      'version', NEW.version
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      action_type := 'status_changed';
      meta := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      );

      -- More specific action types based on status
      IF NEW.status = 'confirmed' THEN
        action_type := 'confirmed';
      ELSIF NEW.status = 'paid' THEN
        action_type := 'paid';
      ELSIF NEW.status = 'cancelled' THEN
        action_type := 'cancelled';
      END IF;
    -- Notes updated
    ELSIF OLD.notes IS DISTINCT FROM NEW.notes THEN
      action_type := 'notes_updated';
      meta := jsonb_build_object(
        'old_notes', OLD.notes,
        'new_notes', NEW.notes
      );
    ELSE
      -- Skip logging for other updates
      RETURN NEW;
    END IF;

    admin_id := NEW.created_by; -- In real app, should get current admin from context
  END IF;

  -- Insert log entry
  INSERT INTO reconciliation_logs (
    reconciliation_id,
    action,
    performed_by,
    metadata
  ) VALUES (
    NEW.id,
    action_type,
    admin_id,
    meta
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically log reconciliation actions
CREATE TRIGGER trigger_log_reconciliation_action
  AFTER INSERT OR UPDATE ON reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION log_reconciliation_action();
