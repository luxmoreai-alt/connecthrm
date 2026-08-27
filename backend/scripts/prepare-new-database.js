require('dotenv').config({ path: '.env' });

if (!process.env.NEW_DATABASE_URL) {
  throw new Error('NEW_DATABASE_URL is missing');
}

process.env.DATABASE_URL = process.env.NEW_DATABASE_URL;
process.env.NODE_ENV = 'production';

require('reflect-metadata');

const { AppDataSource } = require('../dist/config/database');

(async () => {
  await AppDataSource.initialize();
  const migrations = await AppDataSource.runMigrations({ transaction: 'all' });
  console.log(`SCHEMA_READY migrations_applied=${migrations.length}`);
  await AppDataSource.destroy();
})().catch(async (error) => {
  const safeMessage = String(error.message).replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    '[REDACTED_URL]',
  );
  console.error(`SCHEMA_FAILED=${error.code || error.name}: ${safeMessage}`);
  if (AppDataSource.isInitialized) await AppDataSource.destroy().catch(() => undefined);
  process.exit(1);
});
