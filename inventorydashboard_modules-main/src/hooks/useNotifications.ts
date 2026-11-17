import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../App";
import type { AppNotification } from "../types/notification";

const parseTimestamp = (val: any): Date => {
  if (!val) return new Date();
  if (val?.toDate && typeof val.toDate === "function") return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

export function useNotifications() {
  const { user } = useAuth();
  const rawRole = (user?.role || "").toLowerCase();
  const isAdmin = rawRole === "admin" || rawRole.includes("admin");
  const userUid = user?.uid || "";
  const userName = (user?.name || "").trim().toLowerCase();

  const [rawNotifications, setRawNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`read_notifs_${userUid}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`dismissed_notifs_${userUid}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Keep storage in sync when userUid changes
  useEffect(() => {
    try {
      const storedRead = localStorage.getItem(`read_notifs_${userUid}`);
      setReadIds(storedRead ? new Set(JSON.parse(storedRead)) : new Set());
      const storedDismissed = localStorage.getItem(`dismissed_notifs_${userUid}`);
      setDismissedIds(storedDismissed ? new Set(JSON.parse(storedDismissed)) : new Set());
    } catch (e) {
      console.error("Failed to load notification states from localStorage", e);
    }
  }, [userUid]);

  const saveReadIds = (newSet: Set<string>) => {
    setReadIds(newSet);
    try {
      localStorage.setItem(`read_notifs_${userUid}`, JSON.stringify(Array.from(newSet)));
    } catch (e) {
      console.error("Failed to save read notifications", e);
    }
  };

  const saveDismissedIds = (newSet: Set<string>) => {
    setDismissedIds(newSet);
    try {
      localStorage.setItem(`dismissed_notifs_${userUid}`, JSON.stringify(Array.from(newSet)));
    } catch (e) {
      console.error("Failed to save dismissed notifications", e);
    }
  };

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!user) {
      setRawNotifications([]);
      return;
    }

    const unsubs: (() => void)[] = [];
    const generatedNotifsMap = new Map<string, AppNotification[]>();

    const updateAll = () => {
      const combined: AppNotification[] = [];
      generatedNotifsMap.forEach((list) => {
        combined.push(...list);
      });
      // Sort newest first
      combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setRawNotifications(combined);
    };

    // 1. Listen to explicit "notifications" collection
    try {
      const notifQ = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(20));
      const unsubNotifs = onSnapshot(
        notifQ,
        (snap) => {
          const list: AppNotification[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            const targetRole = data.targetRole ? String(data.targetRole).toLowerCase() : "all";
            const targetUser = data.targetUserId ? String(data.targetUserId) : null;

            // Role and user permission check
            if (targetUser && targetUser !== userUid) return;
            if (targetRole !== "all" && targetRole !== rawRole && !(isAdmin && targetRole === "admin")) return;

            list.push({
              id: docSnap.id,
              title: data.title || "Notification",
              message: data.message || "",
              type: data.type || "system",
              severity: data.severity || "info",
              link: data.link || "/dashboard",
              timestamp: parseTimestamp(data.createdAt || data.timestamp),
              read: false,
              targetRole: data.targetRole,
              targetUserId: data.targetUserId,
            });
          });
          generatedNotifsMap.set("explicit", list);
          updateAll();
        },
        (err) => {
          console.warn("Notifications collection snapshot warning:", err);
        }
      );
      unsubs.push(unsubNotifs);
    } catch (err) {
      console.warn("Could not subscribe to notifications collection:", err);
    }

    // 2. Real-time Inventory Alerts (Low stock & Out of stock)
    try {
      const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((docSnap) => {
          const p = docSnap.data();
          const qty = Number(p.totalQuantity ?? p.quantity ?? 0);
          const minStock = Number(p.minStock ?? p.minimumStock ?? 5);
          const name = p.name || p.productName || "Product";

          if (qty <= 0) {
            list.push({
              id: `stock_out_${docSnap.id}`,
              title: "Out of Stock",
              message: `Item "${name}" is completely out of stock (0 left). Reorder required.`,
              type: "inventory",
              severity: "error",
              link: "/inventory",
              timestamp: parseTimestamp(p.updatedAt || p.createdAt),
              read: false,
            });
          } else if (qty <= minStock && isAdmin) {
            // Low stock warning for admins/managers
            list.push({
              id: `stock_low_${docSnap.id}`,
              title: "Low Stock Alert",
              message: `"${name}" has only ${qty} units left (Threshold: ${minStock}).`,
              type: "inventory",
              severity: "warning",
              link: "/inventory",
              timestamp: parseTimestamp(p.updatedAt || p.createdAt),
              read: false,
            });
          }
        });
        generatedNotifsMap.set("products", list.slice(0, 8)); // Top 8 inventory alerts
        updateAll();
      });
      unsubs.push(unsubProducts);
    } catch (err) {
      console.warn("Products snapshot error:", err);
    }

    // 3. Real-time Task Alerts (Assigned tasks, approaching deadlines, overdue)
    try {
      const unsubTasks = onSnapshot(collection(db, "tasks"), (snap) => {
        const list: AppNotification[] = [];
        const now = new Date();

        snap.forEach((docSnap) => {
          const t = docSnap.data();
          const taskName = t.task || t.title || "Untitled Task";
          const staffId = String(t.staffId || "");
          const empName = String(t.employeeName || "").trim().toLowerCase();
          const status = String(t.status || "").toLowerCase();
          const deadline = parseTimestamp(t.deadline);
          const isDone = status === "completed" || status === "closed";

          if (isDone) return;

          const isAssignedToMe = staffId === userUid || (userName && empName.includes(userName));
          const isOverdue = deadline < now;
          const isDueSoon = deadline.getTime() - now.getTime() < 24 * 60 * 60 * 1000 && deadline > now;

          if (isAdmin) {
            // Admin sees critical or delayed tasks across the team
            if (isOverdue || status === "delayed") {
              list.push({
                id: `task_overdue_${docSnap.id}`,
                title: "Overdue Task",
                message: `"${taskName}" assigned to ${t.employeeName || "staff"} missed its deadline.`,
                type: "task",
                severity: "error",
                link: "/task",
                timestamp: deadline,
                read: false,
              });
            } else if (t.priority === "critical") {
              list.push({
                id: `task_crit_${docSnap.id}`,
                title: "Critical Priority Task",
                message: `"${taskName}" requires urgent attention.`,
                type: "task",
                severity: "warning",
                link: "/task",
                timestamp: parseTimestamp(t.updatedAt || t.createdAt),
                read: false,
              });
            }
          } else if (isAssignedToMe) {
            // Staff sees tasks directly assigned to them
            if (isOverdue) {
              list.push({
                id: `task_my_overdue_${docSnap.id}`,
                title: "Task Overdue",
                message: `Your task "${taskName}" is overdue. Please complete or update status.`,
                type: "task",
                severity: "error",
                link: "/task",
                timestamp: deadline,
                read: false,
              });
            } else if (isDueSoon) {
              list.push({
                id: `task_my_due_${docSnap.id}`,
                title: "Task Due Soon",
                message: `"${taskName}" is due within 24 hours.`,
                type: "task",
                severity: "warning",
                link: "/task",
                timestamp: parseTimestamp(t.updatedAt || t.createdAt),
                read: false,
              });
            } else {
              list.push({
                id: `task_my_assigned_${docSnap.id}`,
                title: "Assigned Task",
                message: `You are assigned to: "${taskName}" (Priority: ${(t.priority || "Normal").toUpperCase()}).`,
                type: "task",
                severity: "info",
                link: "/task",
                timestamp: parseTimestamp(t.createdAt),
                read: false,
              });
            }
          }
        });
        generatedNotifsMap.set("tasks", list.slice(0, 8));
        updateAll();
      });
      unsubs.push(unsubTasks);
    } catch (err) {
      console.warn("Tasks snapshot error:", err);
    }

    // 4. Real-time Enquiry Alerts
    try {
      const unsubEnquiries = onSnapshot(collection(db, "enquiries"), (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((docSnap) => {
          const eq = docSnap.data();
          const enqId = eq.enqId || docSnap.id.slice(-6);
          const custName = eq.customerName || eq.name || "Customer";
          const assigned = eq.assignedTo;
          const assignedName = (eq.assignedToName || "").trim().toLowerCase();
          const status = String(eq.status || "");
          const isDropped = status.toLowerCase() === "dropped";

          if (isDropped) return;

          const isAssignedToMe = assigned === userUid || (userName && assignedName.includes(userName));

          if (isAdmin) {
            // Admin sees new unassigned enquiries or newly received leads
            if (!assigned || assigned === "no-one" || assigned === "unassigned") {
              list.push({
                id: `enq_unassigned_${docSnap.id}`,
                title: "New Unassigned Enquiry",
                message: `Enquiry #${enqId} from ${custName} needs staff assignment.`,
                type: "enquiry",
                severity: "info",
                link: "/enquiries",
                timestamp: parseTimestamp(eq.createdAt),
                read: false,
              });
            }
          } else if (isAssignedToMe) {
            // Staff sees enquiries assigned directly to them
            list.push({
              id: `enq_assigned_${docSnap.id}`,
              title: "New Enquiry Assigned",
              message: `You were assigned enquiry #${enqId} for ${custName}.`,
              type: "enquiry",
              severity: "info",
              link: "/enquiries",
              timestamp: parseTimestamp(eq.updatedAt || eq.createdAt),
              read: false,
            });
          }
        });
        generatedNotifsMap.set("enquiries", list.slice(0, 6));
        updateAll();
      });
      unsubs.push(unsubEnquiries);
    } catch (err) {
      console.warn("Enquiries snapshot error:", err);
    }

    // 5. Real-time Bills Alerts (Pending / Overdue Invoices for Admin)
    if (isAdmin) {
      try {
        const unsubBills = onSnapshot(collection(db, "bills"), (snap) => {
          const list: AppNotification[] = [];
          snap.forEach((docSnap) => {
            const b = docSnap.data();
            const invNum = b.invoiceNumber || docSnap.id.slice(-6);
            const cust = b.customerName || "Customer";
            const total = Number(b.totalAmount || 0);
            const status = String(b.status || "").toLowerCase();
            const payStatus = String(b.paymentStatus || "").toLowerCase();

            if (status === "pending" || payStatus === "pending") {
              list.push({
                id: `bill_pending_${docSnap.id}`,
                title: "Pending Invoice Payment",
                message: `Invoice #${invNum} for ${cust} (₹${total.toLocaleString("en-IN")}) is pending payment.`,
                type: "bill",
                severity: "warning",
                link: "/bills",
                timestamp: parseTimestamp(b.dueDate || b.billDate || b.createdAt),
                read: false,
              });
            }
          });
          generatedNotifsMap.set("bills", list.slice(0, 6));
          updateAll();
        });
        unsubs.push(unsubBills);
      } catch (err) {
        console.warn("Bills snapshot error:", err);
      }
    }

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
    };
  }, [user, userUid, rawRole, isAdmin, userName]);

  // Merge read state with notifications and filter dismissed
  const notifications: AppNotification[] = useMemo(() => {
    return rawNotifications
      .filter((n) => !dismissedIds.has(n.id))
      .map((n) => ({
        ...n,
        read: readIds.has(n.id),
      }));
  }, [rawNotifications, readIds, dismissedIds]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        const updated = new Set(prev);
        updated.add(id);
        saveReadIds(updated);
        return updated;
      });
    },
    [userUid]
  );

  const markAllAsRead = useCallback(() => {
    const allIds = new Set(readIds);
    notifications.forEach((n) => allIds.add(n.id));
    saveReadIds(allIds);
  }, [notifications, readIds, userUid]);

  const clearAll = useCallback(() => {
    const allIds = new Set(dismissedIds);
    notifications.forEach((n) => allIds.add(n.id));
    saveDismissedIds(allIds);
  }, [notifications, dismissedIds, userUid]);

  const dismissNotification = useCallback(
    (id: string) => {
      setDismissedIds((prev) => {
        const updated = new Set(prev);
        updated.add(id);
        saveDismissedIds(updated);
        return updated;
      });
    },
    [userUid]
  );

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    dismissNotification,
  };
}
