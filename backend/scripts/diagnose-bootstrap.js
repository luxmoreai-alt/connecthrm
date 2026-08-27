require('dotenv').config({ path: '.env' });

process.env.DATABASE_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
process.env.NODE_ENV = 'production';
require('reflect-metadata');

const { ensureBackendReady } = require('../dist/config/bootstrap');
const { AppDataSource } = require('../dist/config/database');

(async () => {
  await ensureBackendReady();
  console.log('BOOTSTRAP_OK');
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
})().catch(async (error) => {
  console.error(`BOOTSTRAP_FAILED=${error.code || error.name}: ${error.message}`);
  if (AppDataSource.isInitialized) await AppDataSource.destroy().catch(() => undefined);
  process.exit(1);
});
