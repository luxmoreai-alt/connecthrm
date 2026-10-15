import { AppDataSource } from '../config/database';
import { Notification } from '../entities/Notification.entity';
import { User, UserRole } from '../entities/User.entity';
import { ApiError } from '../utils/apiError';
import { PushNotificationService } from './pushNotification.service';

export interface CreateNotificationInput {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
}

export class NotificationService {
  private pushService = new PushNotificationService();
  private get repo() {
    return AppDataSource.getRepository(Notification);
  }

  async create(input: CreateNotificationInput) {
    const notification = await this.repo.save(this.repo.create({ ...input, actionUrl: input.actionUrl || null }));
    await this.pushService.sendToUser(input.recipientId, {
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
      notificationId: notification.id,
      type: input.type,
    }).catch((error) => console.error('Failed to send push notification', error?.message || error));
    return notification;
  }

  async notifyUser(recipientId: string, type: string, title: string, message: string, actionUrl?: string) {
    return this.create({ recipientId, type, title, message, actionUrl });
  }

  async notifyAdmins(type: string, title: string, message: string, actionUrl?: string) {
    const admins = await AppDataSource.getRepository(User).find({
      where: { role: UserRole.ADMIN, isActive: true },
      select: ['id'],
    });
    if (!admins.length) return [];
    const notifications = await this.repo.save(admins.map((admin) => this.repo.create({
      recipientId: admin.id,
      type,
      title,
      message,
      actionUrl: actionUrl || null,
    })));
    await Promise.all(notifications.map((notification) =>
      this.pushService.sendToUser(notification.recipientId, {
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        notificationId: notification.id,
        type: notification.type,
      }).catch((error) => console.error('Failed to send admin push notification', error?.message || error)),
    ));
    return notifications;
  }

  async notifyAll(type: string, title: string, message: string, actionUrl?: string) {
    const users = await AppDataSource.getRepository(User).find({
      where: { isActive: true },
      select: ['id', 'role'],
    });
    if (!users.length) return [];
    const notifications = await this.repo.save(users.map((user) => {
      let recipientActionUrl = actionUrl || null;
      if (user.role === UserRole.ADMIN && actionUrl === '/employee/announcements') recipientActionUrl = '/admin/announcements';
      if (user.role === UserRole.ADMIN && actionUrl === '/employee/holidays') recipientActionUrl = '/admin/settings';
      return this.repo.create({ recipientId: user.id, type, title, message, actionUrl: recipientActionUrl });
    }));
    await Promise.all(notifications.map((notification) =>
      this.pushService.sendToUser(notification.recipientId, {
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        notificationId: notification.id,
        type: notification.type,
      }).catch((error) => console.error('Failed to send broadcast push notification', error?.message || error)),
    ));
    return notifications;
  }

  async listAnnouncements(recipientId: string, limit = 100) {
    return this.repo.find({
      where: { recipientId, type: 'GENERAL_ANNOUNCEMENT' },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async list(recipientId: string, limit = 20) {
    const [items, unreadCount] = await Promise.all([
      this.repo.find({
        where: { recipientId },
        order: { createdAt: 'DESC' },
        take: Math.min(Math.max(limit, 1), 50),
      }),
      this.repo.count({ where: { recipientId, isRead: false } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(id: string, recipientId: string) {
    const notification = await this.repo.findOne({ where: { id, recipientId } });
    if (!notification) throw ApiError.notFound('Notification not found');
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.repo.save(notification);
    }
    return notification;
  }

  async markAllRead(recipientId: string) {
    await this.repo.createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('"recipientId" = :recipientId AND "isRead" = false', { recipientId })
      .execute();
  }
}
