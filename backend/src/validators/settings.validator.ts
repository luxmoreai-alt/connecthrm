import { z } from 'zod';

export const updateSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  companyAddress: z.string().trim().max(1000).nullable().optional(),
  companyLogoUrl: z.string().trim().max(2000).nullable().optional(),
  cinNumber: z.string().trim().max(21).nullable().optional(),
  gstNumber: z.string().trim().max(15).nullable().optional(),
  payslipAdditionalFields: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    value: z.string().trim().min(1).max(250),
  })).max(10).optional(),
  workStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
  workEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
  lateGraceMinutes: z.number().int().min(0).max(120).optional(),
  halfDayMinMinutes: z.number().int().min(1).max(600).optional(),
  fullDayMinMinutes: z.number().int().min(1).max(1440).optional(),
  weekOffDays: z
    .string()
    .min(1)
    .max(100)
    .optional(),
  alternateSaturdayOffRule: z
    .enum(['NONE', 'SECOND_FOURTH', 'FIRST_THIRD'])
    .optional(),
  officeLatitude: z.number().min(-90).max(90).nullable().optional(),
  officeLongitude: z.number().min(-180).max(180).nullable().optional(),
  officeRadiusMeters: z.number().int().positive().nullable().optional(),
  geoFenceRequired: z.boolean().optional(),
  allowRemoteAttendance: z.boolean().optional(),
});

export const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  name: z.string().min(1, 'Holiday name is required').max(255),
});

export const updateHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  name: z.string().min(1, 'Holiday name is required').max(255),
});

export const saveWorkdayOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  type: z.enum(['WORKING_DAY', 'NON_WORKING_DAY']),
  reason: z.string().trim().min(3, 'Reason is required').max(500),
});
