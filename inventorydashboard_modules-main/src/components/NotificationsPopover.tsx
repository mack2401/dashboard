import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Package,
  ListTodo,
  Layers,
  Receipt,
  CheckCircle2,
  CheckCheck,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import type { AppNotification } from "../types/notification";

interface NotificationsPopoverProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSec < 60) return "Just now";
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export default function NotificationsPopover({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onDismiss,
  onClose,
}: NotificationsPopoverProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredList = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const handleNotificationClick = (n: AppNotification) => {
    onMarkAsRead(n.id);
    onClose();
    if (n.link) {
      const cleanTargetId =
        n.metadata?.targetId ||
        n.id.replace(
          /^(stock_out_|stock_low_|task_overdue_|task_crit_|task_my_overdue_|task_my_due_|task_my_assigned_|enq_unassigned_|enq_assigned_|bill_pending_)/,
          ""
        );
      navigate(n.link, {
        state: {
          highlightId: cleanTargetId,
          targetName: n.metadata?.targetName || n.title,
          search: n.metadata?.targetName || "",
          customerName: (n.metadata as any)?.customerName || "",
        },
      });
    }
  };

  const getIcon = (type: string, severity: string) => {
    switch (type) {
      case "inventory":
        return <Package size={16} className={severity === "error" ? "text-rose-600" : "text-amber-600"} />;
      case "task":
        return <ListTodo size={16} className={severity === "error" ? "text-rose-600" : "text-slate-700"} />;
      case "enquiry":
        return <Layers size={16} className="text-slate-700" />;
      case "bill":
        return <Receipt size={16} className="text-slate-700" />;
      default:
        return <Bell size={16} className="text-slate-700" />;
    }
  };

  const getIconBg = (type: string, severity: string) => {
    switch (type) {
      case "inventory":
        return severity === "error" ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200";
      case "task":
        return severity === "error" ? "bg-rose-50 border-rose-200" : "bg-slate-100 border-slate-200";
      case "enquiry":
        return "bg-slate-100 border-slate-200";
      case "bill":
        return "bg-slate-100 border-slate-200";
      default:
        return "bg-slate-100 border-slate-200";
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700">
            <Bell size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Notifications
            </h3>
            <span className="text-[11px] font-medium text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}` : "All caught up"}
            </span>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg transition-all cursor-pointer shadow-2xs border border-transparent hover:border-slate-200"
            title="Mark all as read"
          >
            <CheckCheck size={14} />
            <span>Mark read</span>
          </button>
        )}
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-white border-b border-slate-200 text-xs">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
            filter === "all"
              ? "bg-slate-900 text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter === "unread"
              ? "bg-slate-900 text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                filter === "unread" ? "bg-white text-slate-900" : "bg-slate-100 text-slate-700"
              }`}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
        {filteredList.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-2.5 shadow-2xs">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-xs font-bold text-slate-800">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-[200px]">
              {filter === "unread"
                ? "You have acknowledged all active notifications."
                : "Real-time updates regarding tasks, inventory, and enquiries will appear here."}
            </p>
          </div>
        ) : (
          filteredList.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-3 transition-colors cursor-pointer flex items-start gap-3 group relative ${
                !n.read
                  ? "bg-slate-50/80 hover:bg-slate-100/70 border-l-2 border-blue-500"
                  : "bg-white hover:bg-slate-50"
              }`}
            >
              {/* Type Icon */}
              <div
                className={`p-2 rounded-lg border shrink-0 mt-0.5 shadow-2xs ${getIconBg(
                  n.type,
                  n.severity
                )}`}
              >
                {getIcon(n.type, n.severity)}
              </div>

              {/* Notification Content */}
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-1.5">
                  <p
                    className={`text-xs leading-snug truncate ${
                      !n.read ? "font-bold text-slate-900" : "font-medium text-slate-700"
                    }`}
                  >
                    {n.title}
                  </p>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" title="Unread" />
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                  {n.message}
                </p>

                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-medium text-slate-400">
                    {formatTimeAgo(n.timestamp)}
                  </span>
                  <span className="text-[10px] text-blue-600 font-semibold inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>View</span>
                    <ExternalLink size={9} />
                  </span>
                </div>
              </div>

              {/* Dismiss Single Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all absolute right-2 top-2"
                title="Dismiss"
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 font-medium">
            {notifications.length} total notification{notifications.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={onClearAll}
            type="button"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer p-1 rounded-lg hover:bg-rose-50"
          >
            <Trash2 size={12} />
            <span>Clear all</span>
          </button>
        </div>
      )}
    </div>
  );
}
