import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

/** ใช้เช็กว่าเชื่อมต่อ DB ได้หรือไม่ */
export async function checkConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT 1 as ok');
    return res.rows[0]?.ok === 1;
  } finally {
    client.release();
  }
}

export { pool };
