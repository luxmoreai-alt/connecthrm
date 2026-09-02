import 'reflect-metadata';
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import { swaggerSpec } from './docs/swagger';
import authRoutes from './routes/auth.routes';
import employeeRoutes from './routes/employee.routes';
import personalDetailsRoutes from './routes/personalDetails.routes';
import salaryDetailsRoutes from './routes/salaryDetails.routes';
import documentRoutes from './routes/document.routes';
import settingsRoutes from './routes/settings.routes';
import attendanceRoutes from './routes/attendance.routes';
import leaveRoutes from './routes/leave.routes';
import payrollRoutes from './routes/payroll.routes';
import dashboardRoutes from './routes/dashboard.routes';
import profileRoutes from './routes/profile.routes';
import employeeSalaryStructureRoutes from './routes/employeeSalaryStructure.routes';
import notificationRoutes from './routes/notification.routes';
import hrAccessRoutes from './routes/hrAccess.routes';
import offerIntegrationRoutes from './routes/offerIntegration.routes';
import { ensureBackendReady } from './config/bootstrap';
import { uploadRoot } from './utils/uploadPath';

const app = express();
app.set('trust proxy', 1);

const backendRevision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local';

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const isAllowedOrigin = (origin: string): boolean =>
  allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (!allowed.includes('*')) return false;
    const pattern = new RegExp(`^${allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return pattern.test(origin);
  });

// --------------- Global Middlewares ---------------

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'frame-ancestors': ["'self'", ...allowedOrigins],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Request ID
app.use(requestIdMiddleware);
app.use((_req, res, next) => {
  res.setHeader('X-Connect-HR-Revision', backendRevision);
  next();
});

// Vercel starts the Express application without running server.ts. Initialize
// TypeORM lazily and reuse the connection while the function instance is warm.
app.use(async (_req, _res, next) => {
  try {
    await ensureBackendReady();
    next();
  } catch (error) {
    next(error);
  }
});

// --------------- Swagger Docs ---------------
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --------------- Health Check ---------------
app.get('/', (_req, res) => {
  res.json({ success: true, message: 'Connect HR backend is running' });
});

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'HRMS API is running',
    revision: backendRevision,
    timestamp: new Date().toISOString(),
  });
});

// --------------- Routes ---------------
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/personal-details', personalDetailsRoutes);
app.use('/api/salary-details', salaryDetailsRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/hr-access', hrAccessRoutes);
app.use('/api/integrations/offer-studio', offerIntegrationRoutes);
app.use('/api/salary-structures', employeeSalaryStructureRoutes);

// Serve uploaded files
app.use('/uploads', express.static(uploadRoot));

// --------------- 404 Handler ---------------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    errorCode: 'ROUTE_NOT_FOUND',
  });
});

// --------------- Error Handler ---------------
app.use(errorMiddleware);

export default app;
