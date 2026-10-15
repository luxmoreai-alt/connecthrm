import { DataSource } from 'typeorm';
import { env } from './env';
import { User } from '../entities/User.entity';
import { RefreshToken } from '../entities/RefreshToken.entity';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { PersonalDetails } from '../entities/PersonalDetails.entity';
import { SalaryDetails } from '../entities/SalaryDetails.entity';
import { EmployeeDocument } from '../entities/EmployeeDocument.entity';
import { OrgSettings } from '../entities/OrgSettings.entity';
import { Holiday } from '../entities/Holiday.entity';
import { Attendance } from '../entities/Attendance.entity';
import { AttendancePunch } from '../entities/AttendancePunch.entity';
import { AttendancePolicy } from '../entities/AttendancePolicy.entity';
import { AttendanceSession } from '../entities/AttendanceSession.entity';
import { AttendanceRegularizationRequest } from '../entities/AttendanceRegularizationRequest.entity';
import { AttendancePermissionRequest } from '../entities/AttendancePermissionRequest.entity';
import { AttendanceAuditLog } from '../entities/AttendanceAuditLog.entity';
import { AttendanceEmployeePolicyOverride } from '../entities/AttendanceEmployeePolicyOverride.entity';
import { LeavePolicy } from '../entities/LeavePolicy.entity';
import { LeavePolicySlab } from '../entities/LeavePolicySlab.entity';
import { LeaveRequest } from '../entities/LeaveRequest.entity';
import { PayrollRun } from '../entities/PayrollRun.entity';
import { PayrollRecord } from '../entities/PayrollRecord.entity';
import { PayslipDocument } from '../entities/PayslipDocument.entity';
import { PayrollImportJob } from '../entities/PayrollImportJob.entity';
import { OrganizationSalaryConfig } from '../entities/OrganizationSalaryConfig.entity';
import { SalaryTemplateComponent } from '../entities/SalaryTemplateComponent.entity';
import { EmployeeSalaryStructure } from '../entities/EmployeeSalaryStructure.entity';
import { EmployeeSalaryComponent } from '../entities/EmployeeSalaryComponent.entity';
import { EmployeeStatutoryBreakdown } from '../entities/EmployeeStatutoryBreakdown.entity';
import { Notification } from '../entities/Notification.entity';
import { PushSubscription } from '../entities/PushSubscription.entity';
import { HrPortalAccess } from '../entities/HrPortalAccess.entity';
import { ShiftDefinition } from '../entities/ShiftDefinition.entity';
import { ShiftAssignment } from '../entities/ShiftAssignment.entity';
import { WorkdayOverride } from '../entities/WorkdayOverride.entity';

const isProduction = env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  synchronize: !isProduction,
  logging: !isProduction,
  entities: [
    User,
    RefreshToken,
    EmployeeProfile,
    PersonalDetails,
    SalaryDetails,
    EmployeeDocument,
    OrgSettings,
    Holiday,
    Attendance,
    AttendancePunch,
    AttendancePolicy,
    AttendanceSession,
    AttendanceRegularizationRequest,
    AttendancePermissionRequest,
    AttendanceAuditLog,
    AttendanceEmployeePolicyOverride,
    LeavePolicy,
    LeavePolicySlab,
    LeaveRequest,
    PayrollRun,
    PayrollRecord,
    PayslipDocument,
    PayrollImportJob,
    OrganizationSalaryConfig,
    SalaryTemplateComponent,
    EmployeeSalaryStructure,
    EmployeeSalaryComponent,
    EmployeeStatutoryBreakdown,
    Notification,
    PushSubscription,
    HrPortalAccess,
    ShiftDefinition,
    ShiftAssignment,
    WorkdayOverride,
  ],
  migrations: isProduction ? ['dist/migrations/*.js'] : ['src/migrations/*.ts'],
  subscribers: [],
});
