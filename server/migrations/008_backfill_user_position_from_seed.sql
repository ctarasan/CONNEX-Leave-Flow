-- Backfill users.position (ชื่อตำแหน่ง) ให้ถูกต้องจากข้อมูลต้นแบบ
-- หมายเหตุ: ทำแบบ non-destructive และไม่ยุ่งกับ users.department (แผนก)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS position VARCHAR(255);

UPDATE users
SET position = CASE id
  WHEN '001' THEN 'Managing Director'
  WHEN '002' THEN 'Software Development Manager'
  WHEN '003' THEN 'Financial Director'
  WHEN '004' THEN 'Project Manager'
  WHEN '005' THEN 'Project Manager'
  WHEN '008' THEN 'แม่บ้าน'
  WHEN '011' THEN 'System Analyst'
  WHEN '012' THEN 'Business Analyst'
  WHEN '013' THEN 'Senior System Analyst'
  WHEN '017' THEN 'Senior Programmer'
  WHEN '020' THEN 'Quality Assurance'
  WHEN '021' THEN 'Brand Strategic Manager'
  WHEN '023' THEN 'Creative Designer'
  WHEN '025' THEN 'Quality Assurance'
  WHEN '026' THEN 'Programmer'
  WHEN '027' THEN 'Sale Executive'
  WHEN '028' THEN 'Programmer'
  ELSE position
END
WHERE id IN ('001','002','003','004','005','008','011','012','013','017','020','021','023','025','026','027','028')
  AND (
    position IS NULL
    OR TRIM(position) = ''
    OR position = department
  );

-- ถ้ามีแถวอื่นที่ยัง position ว่าง ให้คงว่างไว้ (Admin จะกรอกเองภายหลัง)
