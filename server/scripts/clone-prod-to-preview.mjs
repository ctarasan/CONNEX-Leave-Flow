import pg from 'pg';

const { Pool } = pg;

const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL;
const PREVIEW_DATABASE_URL = process.env.PREVIEW_DATABASE_URL;

if (!PROD_DATABASE_URL || !PREVIEW_DATABASE_URL) {
  console.error('Missing PROD_DATABASE_URL or PREVIEW_DATABASE_URL');
  process.exit(1);
}

const prodPool = new Pool({ connectionString: PROD_DATABASE_URL });
const previewPool = new Pool({ connectionString: PREVIEW_DATABASE_URL });

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function getPublicTables(pool) {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function getColumns(pool, tableName) {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );
  return rows.map((r) => r.column_name);
}

async function copyTable(prodClient, previewClient, tableName) {
  const columns = await getColumns(previewClient, tableName);
  if (columns.length === 0) return 0;

  const sel = await prodClient.query(`SELECT * FROM ${qIdent(tableName)}`);
  const rows = sel.rows;
  if (rows.length === 0) return 0;

  const colList = columns.map(qIdent).join(', ');
  const batchSize = 200;
  let copied = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];
    let p = 1;

    for (const row of batch) {
      const rowPh = [];
      for (const col of columns) {
        values.push(row[col]);
        rowPh.push(`$${p++}`);
      }
      placeholders.push(`(${rowPh.join(', ')})`);
    }

    await previewClient.query(
      `INSERT INTO ${qIdent(tableName)} (${colList}) VALUES ${placeholders.join(', ')}`,
      values
    );
    copied += batch.length;
  }

  return copied;
}

async function resetOwnedSequences(previewClient) {
  const { rows } = await previewClient.query(`
    SELECT
      sn.nspname AS sequence_schema,
      s.relname AS sequence_name,
      tn.nspname AS table_schema,
      t.relname AS table_name,
      a.attname AS column_name
    FROM pg_class s
    JOIN pg_namespace sn ON sn.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND sn.nspname = 'public' AND tn.nspname = 'public'
  `);

  for (const r of rows) {
    const sql = `
      SELECT setval(
        $1::regclass,
        COALESCE((SELECT MAX(${qIdent(r.column_name)}) FROM ${qIdent(r.table_name)}), 0) + 1,
        false
      )
    `;
    await previewClient.query(sql, [`${r.sequence_schema}.${r.sequence_name}`]);
  }
}

async function run() {
  const prodClient = await prodPool.connect();
  const previewClient = await previewPool.connect();

  try {
    const prodTables = await getPublicTables(prodClient);
    const previewTables = await getPublicTables(previewClient);
    const tables = previewTables.filter((t) => prodTables.includes(t));

    await previewClient.query('BEGIN');
    await previewClient.query(`TRUNCATE TABLE ${tables.map(qIdent).join(', ')} RESTART IDENTITY CASCADE`);

    const summary = [];
    for (const t of tables) {
      const count = await copyTable(prodClient, previewClient, t);
      summary.push({ table: t, rows: count });
    }

    await resetOwnedSequences(previewClient);
    await previewClient.query('COMMIT');

    console.log('Clone completed:');
    for (const s of summary) {
      console.log(`${s.table}: ${s.rows}`);
    }
  } catch (err) {
    await previewClient.query('ROLLBACK');
    throw err;
  } finally {
    prodClient.release();
    previewClient.release();
    await prodPool.end();
    await previewPool.end();
  }
}

run().catch((err) => {
  console.error('Clone failed:', err?.message || err);
  process.exit(1);
});

