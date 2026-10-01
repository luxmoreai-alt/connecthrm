import { z } from 'zod';

export const createEmployeeSchema = z.object({
  empId: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Employee ID must contain at least 2 characters')
    .max(20, 'Employee ID cannot exceed 20 characters')
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Employee ID can contain only letters, numbers, hyphens, and underscores'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email format').trim().toLowerCase(),
  department: z.string().min(1, 'Department is required').max(100),
  designation: z.string().min(1, 'Designation is required').max(100),
  employmentType: z.string().min(1).max(50),
  dateOfJoining: z.string().min(1, 'Date of joining is required'),
  reportingManager: z.string().min(1, 'Reporting manager is required').max(200),
  shiftSchedule: z.string().min(1, 'Shift schedule is required').max(100),
  allowLoginOnlyInsideOffice: z.boolean().default(false),
  officeLatitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .optional(),
  officeLongitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .optional(),
  officeRadiusMeters: z.number().positive('Radius must be positive').optional(),
});

export const updateEmployeeSchema = z.object({
  empId: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Employee ID must contain at least 2 characters')
    .max(20, 'Employee ID cannot exceed 20 characters')
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Employee ID can contain only letters, numbers, hyphens, and underscores')
    .optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().min(1).max(100).optional(),
  designation: z.string().min(1).max(100).optional(),
  employmentType: z.string().min(1).max(50).optional(),
  dateOfJoining: z.string().min(1).optional(),
  reportingManager: z.string().min(1).max(200).optional(),
  shiftSchedule: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  officeLocationRequired: z.boolean().optional(),
  officeLatitude: z.number().min(-90).max(90).nullable().optional(),
  officeLongitude: z.number().min(-180).max(180).nullable().optional(),
  officeRadiusMeters: z.number().positive().nullable().optional(),
});

export const offboardEmployeeSchema = z.object({
  lastWorkingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Last working date must be YYYY-MM-DD'),
  reason: z.enum(['RESIGNED', 'TERMINATED', 'CONTRACT_ENDED', 'ABSCONDED', 'OTHER']),
  notes: z.string().trim().max(1000).optional(),
});

export const resetEmployeePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
