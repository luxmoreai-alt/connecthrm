import { UserRepository } from '../repositories/user.repository';
import { TokenService } from './token.service';
import { LocationService } from './location.service';
import { comparePassword, hashPassword } from '../utils/password';
import { ApiError } from '../utils/apiError';
import { env } from '../config/env';
import { User, UserRole } from '../entities/User.entity';
import { AppDataSource } from '../config/database';
import { HrPortalAccess } from '../entities/HrPortalAccess.entity';
import { assertEmployeeJoiningDateReached } from '../utils/joiningAccess';

interface LoginInput {
  email: string;
  password: string;
  latitude?: number;
  longitude?: number;
  portal?: 'EMPLOYEE' | 'HR';
}

export class AuthService {
  private userRepo: UserRepository;
  private tokenService: TokenService;

  constructor() {
    this.userRepo = new UserRepository();
    this.tokenService = new TokenService();
  }

  async login(input: LoginInput) {
    const { email, password, latitude, longitude, portal = 'EMPLOYEE' } = input;

    if (portal === 'HR') {
      const grant = await AppDataSource.getRepository(HrPortalAccess).findOne({
        where: { loginEmail: email.trim().toLowerCase(), isActive: true },
        relations: ['employee'],
      });
      if (!grant || !grant.employee || !grant.employee.isActive || grant.employee.deletedAt) {
        throw ApiError.unauthorized('Invalid HR portal credentials', 'AUTH_INVALID_CREDENTIALS');
      }
      if (!(await comparePassword(password, grant.passwordHash))) {
        throw ApiError.unauthorized('Invalid HR portal credentials', 'AUTH_INVALID_CREDENTIALS');
      }
      await assertEmployeeJoiningDateReached(grant.employee.id);
      const tokens = await this.tokenService.generateTokenPair({
        id: grant.employee.id,
        email: grant.loginEmail,
        role: 'HR',
        accessGrantId: grant.id,
      });
      grant.lastLoginAt = new Date();
      await AppDataSource.getRepository(HrPortalAccess).save(grant);
      return {
        ...tokens,
        user: {
          id: grant.employee.id,
          email: grant.loginEmail,
          role: 'HR',
          firstName: grant.employee.firstName,
          lastName: grant.employee.lastName,
          empId: grant.employee.empId,
          officeLocationRequired: false,
          employeeTourCompleted: grant.employee.employeeTourCompleted,
        },
      };
    }

    // 1. Find user
    let user = await this.userRepo.findByEmail(email);
    const matchesConfiguredAdmin =
      email === env.ADMIN_EMAIL.trim().toLowerCase() && password === env.ADMIN_PASSWORD;

    // Recover the single configured bootstrap admin if a database switch or
    // incorrectly formatted environment value left its stored hash stale.
    // This path still requires the exact server-side admin credentials.
    if (!user && matchesConfiguredAdmin) {
      user = await this.userRepo.create({
        email: env.ADMIN_EMAIL.trim().toLowerCase(),
        password: await hashPassword(env.ADMIN_PASSWORD),
        firstName: env.ADMIN_FIRST_NAME,
        lastName: env.ADMIN_LAST_NAME,
        role: UserRole.ADMIN,
        isActive: true,
        officeLocationRequired: false,
      });
    }

    if (!user) {
      throw ApiError.unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    // 2. Compare password
    let isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid && matchesConfiguredAdmin) {
      const repairedAdmin: Partial<User> = {
        password: await hashPassword(env.ADMIN_PASSWORD),
        firstName: env.ADMIN_FIRST_NAME,
        lastName: env.ADMIN_LAST_NAME,
        role: UserRole.ADMIN,
        isActive: true,
        officeLocationRequired: false,
      };
      await this.userRepo.update(user.id, repairedAdmin);
      Object.assign(user, repairedAdmin);
      isPasswordValid = true;
    }
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    // 3. Check active status
    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated', 'AUTH_ACCOUNT_DEACTIVATED');
    }
    if (user.role === UserRole.EMPLOYEE) {
      await assertEmployeeJoiningDateReached(user.id);
    }

    // 4. Validate location if required
    if (user.officeLocationRequired) {
      if (latitude == null || longitude == null) {
        throw ApiError.badRequest(
          'Location coordinates are required for this account',
          'AUTH_LOCATION_REQUIRED',
        );
      }

      if (
        user.officeLatitude == null ||
        user.officeLongitude == null ||
        user.officeRadiusMeters == null
      ) {
        throw ApiError.internal(
          'Office location not configured for this user',
          'AUTH_OFFICE_LOCATION_NOT_CONFIGURED',
        );
      }

      const withinRadius = LocationService.isWithinRadius(
        Number(user.officeLatitude),
        Number(user.officeLongitude),
        latitude,
        longitude,
        user.officeRadiusMeters,
      );

      if (!withinRadius) {
        throw ApiError.forbidden(
          'Login allowed only within office premises',
          'AUTH_OUTSIDE_OFFICE',
        );
      }
    }

    // 5. Generate tokens
    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // 6. Update last login
    await this.userRepo.updateLastLogin(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        empId: user.empId,
        officeLocationRequired: user.officeLocationRequired,
        employeeTourCompleted: user.employeeTourCompleted,
      },
    };
  }

  async refresh(refreshToken: string) {
    return this.tokenService.rotateRefreshToken(refreshToken);
  }

  async logout(refreshToken: string) {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  async portalOptions(email: string) {
    const normalized = email.trim().toLowerCase();
    const [user, hrGrant] = await Promise.all([
      this.userRepo.findByEmail(normalized),
      AppDataSource.getRepository(HrPortalAccess).findOne({
        where: { loginEmail: normalized, isActive: true },
        relations: ['employee'],
      }),
    ]);
    return {
      employeeLogin: Boolean(user?.isActive && !user.deletedAt),
      hrLogin: Boolean(hrGrant?.employee?.isActive && !hrGrant.employee.deletedAt),
    };
  }
}
