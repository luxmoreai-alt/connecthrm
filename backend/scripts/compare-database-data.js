require('dotenv').config({ path: '.env' });

const { Client } = require('pg');

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const clientFor = (connectionString) =>
  new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function tableNames(client) {
  const result = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function countRows(client, table) {
  const result = await client.query(
    `SELECT COUNT(*)::bigint::text AS count FROM ${quote(table)}`,
  );
  return BigInt(result.rows[0].count);
}

(async () => {
  const oldUrl = process.env.OLD_DATABASE_URL;
  const newUrl = process.env.NEW_DATABASE_URL;
  if (!oldUrl || !newUrl) throw new Error('OLD_DATABASE_URL and NEW_DATABASE_URL are required');

  const source = clientFor(oldUrl);
  const destination = clientFor(newUrl);
  await source.connect();
  await destination.connect();

  try {
    const oldTables = await tableNames(source);
    const newTables = await tableNames(destination);
    const allTables = [...new Set([...oldTables, ...newTables])].sort();
    let oldTotal = 0n;
    let newTotal = 0n;
    let differences = 0;

    for (const table of allTables) {
      const inOld = oldTables.includes(table);
      const inNew = newTables.includes(table);
      const oldCount = inOld ? await countRows(source, table) : null;
      const newCount = inNew ? await countRows(destination, table) : null;
      if (oldCount !== null) oldTotal += oldCount;
      if (newCount !== null) newTotal += newCount;

      if (oldCount !== newCount) {
        differences += 1;
        const delta = oldCount !== null && newCount !== null ? oldCount - newCount : null;
        console.log(
          `DIFF table=${table} old=${oldCount ?? 'missing'} new=${newCount ?? 'missing'}` +
            (delta === null ? '' : ` old_minus_new=${delta}`),
        );
      }
    }

    console.log(`TOTAL old=${oldTotal} new=${newTotal} differing_tables=${differences}`);
  } finally {
    await source.end().catch(() => undefined);
    await destination.end().catch(() => undefined);
  }
})().catch((error) => {
  const safeMessage = String(error.message).replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    '[REDACTED_URL]',
  );
  console.error(`COMPARE_FAILED=${error.code || error.name}: ${safeMessage}`);
  process.exit(1);
});
