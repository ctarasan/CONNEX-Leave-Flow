-- รองรับโควต้าวันลาแบบทศนิยม (เช่น 11.5 วัน)
ALTER TABLE users
  ALTER COLUMN sick_quota TYPE NUMERIC(10,2) USING sick_quota::NUMERIC(10,2),
  ALTER COLUMN personal_quota TYPE NUMERIC(10,2) USING personal_quota::NUMERIC(10,2),
  ALTER COLUMN vacation_quota TYPE NUMERIC(10,2) USING vacation_quota::NUMERIC(10,2),
  ALTER COLUMN ordination_quota TYPE NUMERIC(10,2) USING ordination_quota::NUMERIC(10,2),
  ALTER COLUMN military_quota TYPE NUMERIC(10,2) USING military_quota::NUMERIC(10,2),
  ALTER COLUMN maternity_quota TYPE NUMERIC(10,2) USING maternity_quota::NUMERIC(10,2),
  ALTER COLUMN sterilization_quota TYPE NUMERIC(10,2) USING sterilization_quota::NUMERIC(10,2),
  ALTER COLUMN paternity_quota TYPE NUMERIC(10,2) USING paternity_quota::NUMERIC(10,2);
