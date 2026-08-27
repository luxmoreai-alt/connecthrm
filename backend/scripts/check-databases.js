require('dotenv').config({ path: '.env' });

const { Client } = require('pg');

async function check(label, connectionString) {
  if (!connectionString) throw new Error(`${label} URL is missing`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const tables = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const rows = await client.query(`
      SELECT COALESCE(SUM(n_live_tup), 0)::bigint::text AS count
      FROM pg_stat_user_tables
    `);
    console.log(
      `${label}=CONNECTED tables=${tables.rows[0].count} estimated_rows=${rows.rows[0].count}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

(async () => {
  await check('OLD', process.env.OLD_DATABASE_URL);
  await check('NEW', process.env.NEW_DATABASE_URL);
})().catch((error) => {
  const safeMessage = String(error.message).replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    '[REDACTED_URL]',
  );
  console.error(`CHECK_FAILED=${error.code || error.name}: ${safeMessage}`);
  process.exit(1);
});
