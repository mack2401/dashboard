export type NotificationType = "inventory" | "task" | "enquiry" | "bill" | "system";
export type NotificationSeverity = "info" | "warning" | "error" | "success";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  severity: NotificationSeverity;
  link: string;
  timestamp: Date;
  read: boolean;
  targetRole?: "admin" | "staff" | "manager" | "all";
  targetUserId?: string;
  metadata?: Record<string, any>;
}
