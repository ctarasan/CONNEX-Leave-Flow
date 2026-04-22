-- Add reject reason fields for expense approval flow (non-destructive)
ALTER TABLE expense_claims
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL;

ALTER TABLE expense_claims
ADD COLUMN IF NOT EXISTS reject_reason TEXT NULL;
