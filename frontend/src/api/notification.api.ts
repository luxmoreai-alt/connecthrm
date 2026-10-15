import { api } from '@/lib/api';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export const notificationApi = {
  getPushConfig: () => api.get<{ configured: boolean; publicKey: string | null }>(`/notifications/push/config`),
  getPushStatus: () => api.get<{ configured: boolean; subscriptionCount: number; enabled: boolean }>(`/notifications/push/status`),
  testPush: () => api.post<{ configured: boolean; subscriptions: number; delivered: number; expired: number; failed: number }>(`/notifications/push/test`),
  subscribePush: (subscription: PushSubscriptionJSON) => api.post<{ subscribed: boolean }>(`/notifications/push/subscribe`, subscription),
  unsubscribePush: (endpoint: string) => api.post<{ subscribed: boolean }>(`/notifications/push/unsubscribe`, { endpoint }),
  list: (limit = 20) => api.get<{ items: NotificationItem[]; unreadCount: number }>(`/notifications?limit=${limit}`),
  markRead: (id: string) => api.patch<NotificationItem>(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  listAnnouncements: (limit = 100) => api.get<NotificationItem[]>(`/notifications/announcements?limit=${limit}`),
  publishAnnouncement: (data: { title: string; message: string }) =>
    api.post<{ deliveredTo: number }>('/notifications/announcements', data),
};
