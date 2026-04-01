-- Add payer admin tracking fields for expense claim payment action
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS paid_set_by_id VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_set_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_expense_claims_paid_set_by ON expense_claims(paid_set_by_id);
