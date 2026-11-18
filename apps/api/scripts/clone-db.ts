import pg from 'pg';

function localUrl(value: string | undefined, variable: string): string {
  if (!value) throw new Error(`${variable} is required`);
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`${variable} must point to a local database`);
  }
  return value;
}

function databaseName(value: string): string {
  return new URL(value).pathname.replace(/^\//, '');
}

const isPlainObject = (v: unknown) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  !Buffer.isBuffer(v);
const isObjectArray = (v: unknown) =>
  Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null;

async function clone() {
  const sourceUrl = localUrl(process.env.CLONE_SOURCE_DATABASE_URL, 'CLONE_SOURCE_DATABASE_URL');
  const targetUrl = localUrl(process.env.CLONE_TARGET_DATABASE_URL, 'CLONE_TARGET_DATABASE_URL');
  if (databaseName(targetUrl) !== 'njangitrust_eval') {
    throw new Error('CLONE_TARGET_DATABASE_URL must target njangitrust_eval');
  }
  if (databaseName(sourceUrl) === databaseName(targetUrl)) {
    throw new Error('Source and target databases must be different');
  }
  const source = new pg.Pool({ connectionString: sourceUrl });
  const target = new pg.Pool({ connectionString: targetUrl });

  try {
    const { rows: tableRows } = await source.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `);

    const client = await target.connect();
    try {
      console.log('Fetching foreign keys on target...');
      const { rows: fkRows } = await client.query<{
        table_name: string;
        conname: string;
        def: string;
      }>(`
        SELECT
          c.conrelid::regclass::text as table_name,
          c.conname,
          pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
      `);

      console.log(`Dropping ${fkRows.length} foreign keys...`);
      for (const fk of fkRows) {
        await client.query(
          `ALTER TABLE ${fk.table_name} DROP CONSTRAINT IF EXISTS "${fk.conname}"`,
        );
      }

      console.log('Disabling triggers...');
      for (const { tablename } of tableRows) {
        await client.query(`ALTER TABLE "${tablename}" DISABLE TRIGGER ALL`);
      }

      console.log('Truncating tables...');
      const tableNames = tableRows.map((r) => `"${r.tablename}"`).join(', ');
      if (tableNames) {
        await client.query(`TRUNCATE TABLE ${tableNames} CASCADE`);
      }

      console.log('Copying table data...');
      for (const { tablename } of tableRows) {
        const { rows: data } = await source.query<Record<string, unknown>>(
          `SELECT * FROM "${tablename}"`,
        );
        if (data.length === 0) continue;

        console.log(`  ${tablename}: ${data.length} rows`);
        const columns = Object.keys(data[0] ?? {});
        const colList = columns.map((c) => `"${c}"`).join(', ');

        for (const row of data) {
          const values = columns.map((c) => {
            const val = row[c];
            if (isPlainObject(val) || isObjectArray(val)) {
              return JSON.stringify(val);
            }
            return val;
          });
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          await client.query(
            `INSERT INTO "${tablename}" (${colList}) VALUES (${placeholders})`,
            values,
          );
        }
      }

      console.log('Re-enabling triggers...');
      for (const { tablename } of tableRows) {
        await client.query(`ALTER TABLE "${tablename}" ENABLE TRIGGER ALL`);
      }

      console.log(`Re-adding ${fkRows.length} foreign keys...`);
      for (const fk of fkRows) {
        await client.query(`ALTER TABLE ${fk.table_name} ADD CONSTRAINT "${fk.conname}" ${fk.def}`);
      }

      console.log('Clone finished successfully!');
    } finally {
      client.release();
    }
  } finally {
    await source.end();
    await target.end();
  }
}

clone().catch((err) => {
  console.error('Clone failed:', err);
  process.exit(1);
});
