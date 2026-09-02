# Connect HR — Vercel deployment

Deploy this repository as two Vercel projects. Both projects can point to the same Git repository, but each must use a different Root Directory.

## 1. Backend project

- Root Directory: `backend`
- Framework Preset: Other
- Install Command: `npm ci`
- Build Command: leave empty (Vercel detects the Express entry in `api/index.ts`)
- Node.js: 20 or newer

Add these environment variables for Production (and Preview only when needed):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
JWT_ACCESS_SECRET=LONG_RANDOM_SECRET
JWT_REFRESH_SECRET=DIFFERENT_LONG_RANDOM_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=production
CORS_ORIGIN=https://hrm-5byz.vercel.app
APP_URL=https://hrm-5byz.vercel.app
COOKIE_SAME_SITE=none
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=STRONG_INITIAL_ADMIN_PASSWORD
ADMIN_FIRST_NAME=System
ADMIN_LAST_NAME=Admin
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=your-email@gmail.com
SMTP_FROM_NAME=Connect HR
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
OFFER_APP_URL=https://offer-backend-seven.vercel.app
OFFER_SYNC_TOKEN=SAME_LONG_RANDOM_TOKEN_USED_AS_HRMS_SYNC_TOKEN_IN_OFFER_STUDIO
```

Do not add `PORT`; Vercel controls the function port. Generate new JWT secrets for production rather than copying development values. `ADMIN_PASSWORD` is used only when the configured admin does not already exist.

After deployment, verify:

```text
https://YOUR-BACKEND.vercel.app/api/health
```

## 2. Frontend project

- Root Directory: `frontend`
- Framework Preset: Next.js
- Install Command: `npm ci`
- Build Command: `npm run build`

Add:

```env
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.vercel.app/api
```

Deploy the frontend, then copy its final production URL into the backend `CORS_ORIGIN` and `APP_URL` variables and redeploy the backend. Use exact origins. If a preview frontend must call the production backend, add that exact preview URL as another comma-separated `CORS_ORIGIN` value.

## File storage

Create a **public Vercel Blob store** and connect it to the backend project. Vercel adds `BLOB_READ_WRITE_TOKEN`; profile photos are stored there and their permanent Blob URLs are saved in Neon.

Vercel Functions do not provide permanent local file storage. Employee documents and generated payslip files still require a separate **private** Blob/S3 store with authenticated downloads. Government-ID documents must not be placed in the public profile-photo store.

Payslip PDF generation also requires a serverless-compatible Chromium runtime; a desktop `CHROME_PATH` is not available in a standard Vercel Function. Until durable storage and serverless Chromium are connected, use the existing local backend or a persistent Node host for file and PDF workflows.
