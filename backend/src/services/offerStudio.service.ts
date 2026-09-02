import { env } from '../config/env';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { PersonalDetails } from '../entities/PersonalDetails.entity';

export interface AppointmentDraftSyncResult {
  ok: boolean;
  skipped?: boolean;
  created?: boolean;
  locked?: boolean;
  appointmentId?: string;
  error?: string;
}

export class OfferStudioService {
  async syncAppointmentDraft(
    profile: EmployeeProfile,
    details: PersonalDetails,
  ): Promise<AppointmentDraftSyncResult> {
    if (!env.OFFER_APP_URL || !env.OFFER_SYNC_TOKEN) {
      return { ok: false, skipped: true, error: 'Offer Studio integration is not configured.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const baseUrl = env.OFFER_APP_URL.replace(/\/+$/, '');

    try {
      const response = await fetch(`${baseUrl}/api/sync-appointment-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HRMS-Sync-Token': env.OFFER_SYNC_TOKEN,
        },
        body: JSON.stringify({
          userId: profile.userId,
          employeeId: profile.user?.empId || '',
          fullName: [profile.user?.firstName, profile.user?.lastName].filter(Boolean).join(' '),
          email: profile.user?.email || '',
          personalDetailsId: details.id,
          updatedAt: details.updatedAt,
          personalDetails: {
            aadhaarNumber: details.aadhaarNumber,
            panNumber: details.panNumber,
            mobileNumber: details.mobileNumber,
            whatsappNumber: details.whatsappNumber,
            dateOfBirth: details.dateOfBirth,
            gender: details.gender,
            maritalStatus: details.maritalStatus,
            nationality: details.nationality,
            currentAddressLine1: details.currentAddressLine1,
            currentCity: details.currentCity,
            currentState: details.currentState,
            currentPincode: details.currentPincode,
            currentCountry: details.currentCountry,
          },
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        return { ok: false, error: String(payload.error || `Offer Studio returned HTTP ${response.status}.`) };
      }

      return {
        ok: true,
        skipped: Boolean(payload.skipped),
        created: Boolean(payload.created),
        locked: Boolean(payload.locked),
        appointmentId: typeof payload.appointmentId === 'string' ? payload.appointmentId : undefined,
      };
    } catch (error) {
      const message = error instanceof Error
        ? (error.name === 'AbortError' ? 'Offer Studio sync timed out.' : error.message)
        : 'Offer Studio sync failed.';
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
