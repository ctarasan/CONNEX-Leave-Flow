-- Data cleansing: ลบประเภทวันลาซ้ำ ให้เหลือแบบละ 1 รายการ (ตาม UPPER(id))
-- รันครั้งเดียวหลังมีข้อมูลซ้ำใน leave_types

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY UPPER(id) ORDER BY id) AS rn
  FROM leave_types
)
DELETE FROM leave_types
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
