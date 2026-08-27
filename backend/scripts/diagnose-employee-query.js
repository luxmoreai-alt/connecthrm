require('dotenv').config({ path: '.env' });

process.env.DATABASE_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
process.env.NODE_ENV = 'production';
require('reflect-metadata');

const { AppDataSource } = require('../dist/config/database');
const { EmployeeProfile } = require('../dist/entities/EmployeeProfile.entity');

(async () => {
  await AppDataSource.initialize();
  const profiles = await AppDataSource.getRepository(EmployeeProfile).find({
    relations: ['user'],
    order: { createdAt: 'DESC' },
  });
  console.log(`EMPLOYEE_QUERY_OK profiles=${profiles.length}`);
  await AppDataSource.destroy();
})().catch(async (error) => {
  console.error(`EMPLOYEE_QUERY_FAILED=${error.code || error.name}: ${error.message}`);
  if (AppDataSource.isInitialized) await AppDataSource.destroy().catch(() => undefined);
  process.exit(1);
});
