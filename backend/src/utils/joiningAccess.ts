import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { ApiError } from './apiError';

const currentDateKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export async function assertEmployeeJoiningDateReached(userId: string): Promise<void> {
  const profile = await AppDataSource.getRepository(EmployeeProfile).findOne({ where: { userId } });
  if (!profile?.dateOfJoining || profile.dateOfJoining <= currentDateKey()) return;

  const readableDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: env.APP_TIMEZONE,
  }).format(new Date(`${profile.dateOfJoining}T00:00:00+05:30`));
  throw ApiError.forbidden(
    `Your HRMS access will begin on your joining date, ${readableDate}.`,
    'AUTH_BEFORE_JOINING_DATE',
  );
}
