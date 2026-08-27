require('dotenv').config({ path: '.env' });

const { Client } = require('pg');

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;

function clientFor(connectionString) {
  return new Client({ connectionString, ssl: { rejectUnauthorized: false } });
}

async function tables(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function columns(client, table) {
  const result = await client.query(
    `SELECT column_name, is_generated
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows
    .filter((row) => row.is_generated === 'NEVER')
    .map((row) => row.column_name);
}

async function jsonColumns(client, table) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND data_type IN ('json', 'jsonb')`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function foreignKeys(client, selectedTables) {
  const result = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint constraint_row
      JOIN pg_class child ON child.oid = constraint_row.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = constraint_row.confrelid
     WHERE constraint_row.contype = 'f'
       AND child_ns.nspname = 'public'
  `);
  const selected = new Set(selectedTables);
  return result.rows.filter(
    ({ child, parent }) => selected.has(child) && selected.has(parent) && child !== parent,
  );
}

function insertionOrder(tableNames, dependencies) {
  const remaining = new Set(tableNames);
  const output = [];

  while (remaining.size) {
    const ready = [...remaining].filter((table) =>
      dependencies
        .filter(({ child }) => child === table)
        .every(({ parent }) => !remaining.has(parent)),
    );
    if (!ready.length) {
      throw new Error(`Foreign-key cycle detected among: ${[...remaining].join(', ')}`);
    }
    ready.sort();
    ready.forEach((table) => {
      remaining.delete(table);
      output.push(table);
    });
  }
  return output;
}

async function insertRows(source, destination, table, columnNames, jsonColumnNames) {
  const data = await source.query(
    `SELECT ${columnNames.map(quote).join(', ')} FROM ${quote(table)}`,
  );
  if (!data.rows.length) return 0;

  const maximumParameters = 60000;
  const batchSize = Math.max(1, Math.floor(maximumParameters / columnNames.length));

  for (let offset = 0; offset < data.rows.length; offset += batchSize) {
    const batch = data.rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columnNames.map((column) => {
        const value = row[column];
        values.push(
          jsonColumnNames.has(column) && value !== null ? JSON.stringify(value) : value,
        );
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await destination.query(
      `INSERT INTO ${quote(table)} (${columnNames.map(quote).join(', ')}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(', ')}`,
      values,
    );
  }
  return data.rows.length;
}

async function resetSequences(client, table, columnNames) {
  for (const column of columnNames) {
    const sequenceResult = await client.query(
      'SELECT pg_get_serial_sequence($1, $2) AS sequence_name',
      [`public.${table}`, column],
    );
    const sequence = sequenceResult.rows[0].sequence_name;
    if (!sequence) continue;

    const maximum = await client.query(
      `SELECT MAX(${quote(column)})::bigint AS maximum FROM ${quote(table)}`,
    );
    if (maximum.rows[0].maximum === null) {
      await client.query('SELECT setval($1::regclass, 1, false)', [sequence]);
    } else {
      await client.query('SELECT setval($1::regclass, $2, true)', [
        sequence,
        maximum.rows[0].maximum,
      ]);
    }
  }
}

(async () => {
  const oldUrl = process.env.OLD_DATABASE_URL;
  const newUrl = process.env.NEW_DATABASE_URL;
  if (!oldUrl || !newUrl) throw new Error('OLD_DATABASE_URL and NEW_DATABASE_URL are required');
  if (oldUrl === newUrl) throw new Error('Source and destination URLs must be different');

  const source = clientFor(oldUrl);
  const destination = clientFor(newUrl);
  await source.connect();
  await destination.connect();
  let sourceTransactionOpen = false;
  let destinationTransactionOpen = false;

  try {
    await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    sourceTransactionOpen = true;
    const sourceTables = await tables(source);
    const destinationTables = await tables(destination);
    const sourceAppTables = sourceTables.filter((table) => table !== 'migrations');
    const destinationAppTables = destinationTables.filter((table) => table !== 'migrations');

    if (sourceAppTables.join('\n') !== destinationAppTables.join('\n')) {
      throw new Error('Source and destination table sets differ after migrations');
    }

    const tableColumns = new Map();
    const tableJsonColumns = new Map();
    for (const table of sourceAppTables) {
      const sourceColumns = await columns(source, table);
      const destinationColumns = await columns(destination, table);
      if ([...sourceColumns].sort().join('\n') !== [...destinationColumns].sort().join('\n')) {
        const sourceOnly = sourceColumns.filter((column) => !destinationColumns.includes(column));
        const destinationOnly = destinationColumns.filter((column) => !sourceColumns.includes(column));
        throw new Error(
          `Column definitions differ for table ${table}; source_only=${sourceOnly.join(',') || 'none'}; destination_only=${destinationOnly.join(',') || 'none'}`,
        );
      }
      tableColumns.set(table, sourceColumns);
      tableJsonColumns.set(table, await jsonColumns(source, table));
    }

    const order = insertionOrder(
      sourceAppTables,
      await foreignKeys(destination, sourceAppTables),
    );

    await destination.query('BEGIN');
    destinationTransactionOpen = true;
    try {
      if (sourceAppTables.length) {
        await destination.query(
          `TRUNCATE ${sourceAppTables.map(quote).join(', ')} RESTART IDENTITY CASCADE`,
        );
      }

      let total = 0;
      for (const table of order) {
        const count = await insertRows(
          source,
          destination,
          table,
          tableColumns.get(table),
          tableJsonColumns.get(table),
        );
        total += count;
        console.log(`COPIED table=${table} rows=${count}`);
      }
      for (const table of order) {
        await resetSequences(destination, table, tableColumns.get(table));
      }

      for (const table of sourceAppTables) {
        const sourceCount = await source.query(`SELECT COUNT(*)::bigint::text AS count FROM ${quote(table)}`);
        const destinationCount = await destination.query(`SELECT COUNT(*)::bigint::text AS count FROM ${quote(table)}`);
        if (sourceCount.rows[0].count !== destinationCount.rows[0].count) {
          throw new Error(`Verification failed for table ${table}`);
        }
      }

      await destination.query('COMMIT');
      destinationTransactionOpen = false;
      await source.query('COMMIT');
      sourceTransactionOpen = false;
      console.log(`DATA_COPY_COMMITTED tables=${order.length} rows=${total}`);
      console.log(`VERIFIED tables=${sourceAppTables.length}`);
    } catch (error) {
      if (destinationTransactionOpen) {
        await destination.query('ROLLBACK');
        destinationTransactionOpen = false;
      }
      throw error;
    }
  } finally {
    if (destinationTransactionOpen) await destination.query('ROLLBACK').catch(() => undefined);
    if (sourceTransactionOpen) await source.query('ROLLBACK').catch(() => undefined);
    await source.end().catch(() => undefined);
    await destination.end().catch(() => undefined);
  }
})().catch((error) => {
  const safeMessage = String(error.message).replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    '[REDACTED_URL]',
  );
  console.error(`COPY_FAILED=${error.code || error.name}: ${safeMessage}`);
  process.exit(1);
});
