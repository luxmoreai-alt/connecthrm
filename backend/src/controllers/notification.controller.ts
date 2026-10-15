import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { ApiResponse } from '../utils/apiResponse';
import { z } from 'zod';
import { ApiError } from '../utils/apiError';
import { PushNotificationService } from '../services/pushNotification.service';

const notificationService = new NotificationService();
const pushService = new PushNotificationService();
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4000),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const announcementSchema = z.object({
  title: z.string().trim().min(3).max(200),
  message: z.string().trim().min(3).max(3000),
});

export class NotificationController {
  static async pushConfig(_req: Request, res: Response): Promise<void> {
    ApiResponse.success(res, 'Push notification configuration retrieved', await pushService.getPublicConfig());
  }

  static async pushStatus(req: Request, res: Response): Promise<void> {
    const result = await pushService.getStatus(req.user!.userId);
    ApiResponse.success(res, 'Push notification status retrieved', result);
  }

  static async testPush(req: Request, res: Response): Promise<void> {
    const result = await pushService.sendToUser(req.user!.userId, {
      title: 'Connect HR test notification',
      message: 'Mobile push notifications are working correctly on this device.',
      actionUrl: req.user!.role === 'EMPLOYEE' ? '/employee/dashboard' : '/admin/dashboard',
      type: 'PUSH_TEST',
    });
    if (!result.configured) {
      throw ApiError.badRequest('Push service is not configured on the server', 'PUSH_NOT_CONFIGURED');
    }
    if (result.subscriptions === 0) {
      throw ApiError.badRequest('No mobile device is registered for this account', 'PUSH_DEVICE_NOT_REGISTERED');
    }
    if (result.delivered === 0) {
      throw ApiError.badRequest('The push provider could not deliver the test notification', 'PUSH_DELIVERY_FAILED');
    }
    ApiResponse.success(res, 'Test notification sent', result);
  }

  static async subscribe(req: Request, res: Response): Promise<void> {
    if (!(await pushService.isConfigured())) {
      throw ApiError.badRequest('Push service is not configured on the server', 'PUSH_NOT_CONFIGURED');
    }
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest('Invalid push subscription', 'INVALID_PUSH_SUBSCRIPTION');
    await pushService.subscribe(req.user!.userId, parsed.data, req.get('user-agent'));
    ApiResponse.success(res, 'Push notifications enabled', { subscribed: true });
  }

  static async unsubscribe(req: Request, res: Response): Promise<void> {
    const endpoint = z.string().url().safeParse(req.body?.endpoint);
    if (!endpoint.success) throw ApiError.badRequest('Invalid push endpoint', 'INVALID_PUSH_ENDPOINT');
    await pushService.unsubscribe(req.user!.userId, endpoint.data);
    ApiResponse.success(res, 'Push notifications disabled', { subscribed: false });
  }
  static async list(req: Request, res: Response): Promise<void> {
    const result = await notificationService.list(req.user!.userId, Number(req.query.limit) || 20);
    ApiResponse.success(res, 'Notifications retrieved', result);
  }

  static async markRead(req: Request, res: Response): Promise<void> {
    const result = await notificationService.markRead(req.params.id as string, req.user!.userId);
    ApiResponse.success(res, 'Notification marked as read', result);
  }

  static async markAllRead(req: Request, res: Response): Promise<void> {
    await notificationService.markAllRead(req.user!.userId);
    ApiResponse.success(res, 'All notifications marked as read', null);
  }

  static async listAnnouncements(req: Request, res: Response): Promise<void> {
    const result = await notificationService.listAnnouncements(req.user!.userId, Number(req.query.limit) || 100);
    ApiResponse.success(res, 'Announcements retrieved', result);
  }

  static async publishAnnouncement(req: Request, res: Response): Promise<void> {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'VALIDATION_ERROR');
    }
    const sent = await notificationService.notifyAll(
      'GENERAL_ANNOUNCEMENT',
      parsed.data.title,
      parsed.data.message,
      '/employee/announcements',
    );
    ApiResponse.created(res, `Announcement sent to ${sent.length} active users`, { deliveredTo: sent.length });
  }
}
