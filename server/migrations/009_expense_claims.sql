-- ===================================
-- Expense claims tables (non-destructive)
-- ===================================

CREATE TABLE IF NOT EXISTS expense_types (
  id VARCHAR(100) PRIMARY KEY,
  label VARCHAR(255) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_claims (
  id VARCHAR(100) PRIMARY KEY,
  requester_id VARCHAR(10) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_id VARCHAR(10) NULL REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'WAITING', 'APPROVED', 'PAID', 'REJECTED')),
  claim_date DATE NOT NULL,
  submitted_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  paid_date DATE NULL,
  admin_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_claim_items (
  id VARCHAR(100) PRIMARY KEY,
  claim_id VARCHAR(100) NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  project_id VARCHAR(100) NULL REFERENCES timesheet_projects(id) ON DELETE SET NULL,
  expense_type_id VARCHAR(100) NOT NULL REFERENCES expense_types(id) ON DELETE RESTRICT,
  detail TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_requester ON expense_claims(requester_id, claim_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_expense_claim_items_claim ON expense_claim_items(claim_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_expense_types_updated_at ON expense_types;
    CREATE TRIGGER update_expense_types_updated_at
      BEFORE UPDATE ON expense_types
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_expense_claims_updated_at ON expense_claims;
    CREATE TRIGGER update_expense_claims_updated_at
      BEFORE UPDATE ON expense_claims
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_expense_claim_items_updated_at ON expense_claim_items;
    CREATE TRIGGER update_expense_claim_items_updated_at
      BEFORE UPDATE ON expense_claim_items
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO expense_types (id, label, is_active)
VALUES
  ('travel', 'ค่าเดินทาง', TRUE),
  ('stationery', 'ค่าเครื่องเขียน', TRUE),
  ('messenger', 'ค่า Messenger', TRUE)
ON CONFLICT (id) DO UPDATE
SET
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active;
