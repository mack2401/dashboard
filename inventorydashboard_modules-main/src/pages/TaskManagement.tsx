// TaskManagement.tsx - Updated with subtask-level statistics
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import { useItemHighlighter } from '../hooks/useItemHighlighter';
import { ItemLocatedBanner } from '../components/common/ItemLocatedBanner';
import { 
  Search, 
  Calendar, 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Edit2, 
  X,
  Plus,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Star,
  Target,
  FileText,
  Tag,
  Briefcase,
  Flag,
  CheckSquare,
  Square,
  FolderOpenDot,
  GripVertical,
  MoreVertical,
  Eye,
  Circle,
  CircleDot,
  CircleCheck,
  CircleX,
  CircleAlert,
  BarChart3,
  ListChecks,
  PieChart
} from 'lucide-react';
import { db } from "../firebase";
import { useAuth } from "../App";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import TaskDashboard from './TaskDashboard';

// ============ TYPES AND INTERFACES ============
interface ResponsibleStaff {
  id: string;
  name: string;
  email?: string;
  status?: 'pending' | 'inprogress' | 'completed' | 'closed';
  completedAt?: Date | null;
}

interface SubTask {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  deadline: string;
  status: 'pending' | 'inprogress' | 'completed' | 'delayed' | 'closed';
  responsibleStaff: ResponsibleStaff[];
  completionProgress?: number;
}

interface Task {
  id: string;
  staffId: string;
  employeeName: string;
  status: 'inprogress' | 'completed' | 'delayed' | 'assigned' | 'opened' | 'closed';
  deadline: Timestamp | Date | string;
  task: string;
  createdAt: Timestamp | Date | string;
  updatedAt: Timestamp | Date | string;
  assignedBy?: string;
  assignedByName?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  primaryResponsibility?: string[];
  additionalNotes?: string;
  subTasks?: SubTask[];
  taskGroupId?: string;
  isGroupTask?: boolean;
  overallProgress?: number;
  createdBy?: string;
  createdByName?: string;
  openedAt?: Timestamp | Date | string;
  openedBy?: string[];
}

interface Employee {
  id: string;
  employeeName: string;
  email: string;
  role: 'admin' | 'staff' | 'manager';
  department?: string;
  position?: string;
}

type TaskStatus = 'inprogress' | 'completed' | 'delayed' | 'assigned' | 'opened' | 'closed';
type SortField = 'employeeName' | 'task' | 'status' | 'deadline' | 'createdAt' | 'priority' | 'category';
type SortDirection = 'asc' | 'desc';

// ============ HELPER FUNCTIONS ============
const formatDate = (date: Timestamp | Date | string | null | undefined): string => {
  if (!date) return 'Not set';
  
  try {
    let d: Date;
    
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return 'Invalid date';
    }
    
    if (isNaN(d.getTime())) {
      return 'Invalid date';
    }
    
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

const formatDateTime = (date: Timestamp | Date | string | null | undefined): string => {
  if (!date) return 'Not set';
  
  try {
    let d: Date;
    
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return 'Invalid date';
    }
    
    if (isNaN(d.getTime())) {
      return 'Invalid date';
    }
    
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return 'Invalid date';
  }
};

const getStatusColor = (status: TaskStatus): string => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'inprogress': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'delayed': return 'bg-red-100 text-red-800 border-red-200';
    case 'assigned': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'opened': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case 'assigned': return <Circle className="w-4 h-4" />;
    case 'opened': return <CircleDot className="w-4 h-4" />;
    case 'inprogress': return <Clock className="w-4 h-4" />;
    case 'completed': return <CheckCircle className="w-4 h-4" />;
    case 'delayed': return <AlertCircle className="w-4 h-4" />;
    case 'closed': return <CircleX className="w-4 h-4" />;
    default: return <Circle className="w-4 h-4" />;
  }
};

const getPriorityIcon = (priority: string) => {
  switch (priority) {
    case 'critical': return <CircleAlert className="w-4 h-4" />;
    case 'high': return <Flag className="w-4 h-4" />;
    case 'medium': return <Flag className="w-4 h-4" />;
    case 'low': return <Flag className="w-4 h-4" />;
    default: return <Flag className="w-4 h-4" />;
  }
};

const getSubTaskStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800';
    case 'inprogress': return 'bg-blue-100 text-blue-800';
    case 'delayed': return 'bg-red-100 text-red-800';
    case 'closed': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const cleanObjectForFirestore = (obj: any): any => {
  if (obj === undefined || obj === null) return null;
  if (obj instanceof Date) return obj;
  if (obj instanceof Timestamp) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanObjectForFirestore(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = cleanObjectForFirestore(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
};

// Helper to get sub-task status counts for a task
const getSubTaskStatusCounts = (subTasks: SubTask[] | undefined) => {
  if (!subTasks || subTasks.length === 0) {
    return { pending: 0, inprogress: 0, completed: 0, delayed: 0, closed: 0, total: 0 };
  }
  return {
    pending: subTasks.filter(st => st.status === 'pending').length,
    inprogress: subTasks.filter(st => st.status === 'inprogress').length,
    completed: subTasks.filter(st => st.status === 'completed').length,
    delayed: subTasks.filter(st => st.status === 'delayed').length,
    closed: subTasks.filter(st => st.status === 'closed').length,
    total: subTasks.length
  };
};

// Helper to get sub-task priority counts for a task
const getSubTaskPriorityCounts = (subTasks: SubTask[] | undefined) => {
  if (!subTasks || subTasks.length === 0) {
    return { low: 0, medium: 0, high: 0, critical: 0, total: 0 };
  }
  return {
    low: subTasks.filter(st => st.priority === 'low').length,
    medium: subTasks.filter(st => st.priority === 'medium').length,
    high: subTasks.filter(st => st.priority === 'high').length,
    critical: subTasks.filter(st => st.priority === 'critical').length,
    total: subTasks.length
  };
};

// Helper to get overall subtask statistics across all tasks
const getOverallSubTaskStats = (tasks: Task[]) => {
  let totalSubTasks = 0;
  let pendingSubTasks = 0;
  let inprogressSubTasks = 0;
  let completedSubTasks = 0;
  let delayedSubTasks = 0;
  let closedSubTasks = 0;

  tasks.forEach(task => {
    if (task.subTasks && task.subTasks.length > 0) {
      task.subTasks.forEach(subTask => {
        totalSubTasks++;
        switch (subTask.status) {
          case 'pending': pendingSubTasks++; break;
          case 'inprogress': inprogressSubTasks++; break;
          case 'completed': completedSubTasks++; break;
          case 'delayed': delayedSubTasks++; break;
          case 'closed': closedSubTasks++; break;
        }
      });
    }
  });

  return {
    total: totalSubTasks,
    pending: pendingSubTasks,
    inprogress: inprogressSubTasks,
    completed: completedSubTasks,
    delayed: delayedSubTasks,
    closed: closedSubTasks
  };
};

// ============ MAIN COMPONENT ============
const TaskManagement: React.FC = () => {
  const { user } = useAuth();
  
  // ============ STATES ============
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useState<'all' | 'my-responsibilities'>('all');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Global search & notification deep-linking highlighter
  const {
    highlightId,
    targetSearch,
    targetName,
    isBannerVisible,
    clearHighlight,
    isHighlighted,
    scrollToAndHighlight,
  } = useItemHighlighter();

  // Populate search filter when navigated from search/notification
  useEffect(() => {
    if (targetSearch) {
      setSearchTerm(targetSearch);
    }
  }, [targetSearch]);

  // Ensure targeted task is on current page, expanded, and scrolled to
  useEffect(() => {
    if (highlightId && filteredTasks.length > 0) {
      const foundIdx = filteredTasks.findIndex((t) => t.id === highlightId);
      if (foundIdx >= 0) {
        const targetPage = Math.floor(foundIdx / itemsPerPage) + 1;
        if (currentPage !== targetPage) {
          setCurrentPage(targetPage);
        }
        setExpandedTaskId(highlightId);
        scrollToAndHighlight(`task-row-${highlightId}`);
      }
    }
  }, [highlightId, filteredTasks, itemsPerPage, currentPage, scrollToAndHighlight]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterPriority, viewMode, itemsPerPage]);

  const [newTask, setNewTask] = useState({
    staffId: '',
    category: '',
    additionalNotes: '',
    subTasks: [] as SubTask[]
  });

  const [currentSubTask, setCurrentSubTask] = useState<SubTask>({
    id: Date.now().toString(),
    description: '',
    priority: 'medium',
    deadline: '',
    status: 'pending',
    responsibleStaff: [],
    completionProgress: 0
  });

  const [selectedStaffForSubTask, setSelectedStaffForSubTask] = useState<string[]>([]);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [editSubTasks, setEditSubTasks] = useState<SubTask[]>([]);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Auto-select staff user when modal opens
  useEffect(() => {
    if (isAddModalOpen && user?.role === 'staff' && user?.uid && !newTask.staffId) {
      setNewTask(prev => ({ ...prev, staffId: user.uid }));
    }
  }, [isAddModalOpen, user?.role, user?.uid, newTask.staffId]);

  // ============ FIREBASE SUBSCRIPTIONS ============
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    let employeesQuery;
    if (user.role === 'admin') {
      employeesQuery = query(
        collection(db, 'employees'),
        where('role', '!=', 'admin')
      );
    } else if (user.role === 'manager') {
      employeesQuery = query(
        collection(db, 'employees'),
        where('role', '==', 'staff')
      );
    } else {
      employeesQuery = query(
        collection(db, 'employees'),
        where('id', '==', user.uid)
      );
    }

    const unsubscribeEmployees = onSnapshot(employeesQuery,
      (snapshot) => {
        const employeesData: Employee[] = snapshot.docs.map(doc => ({
          ...doc.data()
        } as Employee));
        setEmployees(employeesData);
      },
      (error) => {
        console.error('Error fetching employees:', error);
        setLoading(false);
      }
    );

    let tasksQuery;
    if (user.role === 'admin' || user.role === 'manager') {
      tasksQuery = query(
        collection(db, 'tasks'),
        orderBy('createdAt', 'desc')
      );
    } else {
      tasksQuery = query(
        collection(db, 'tasks'),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribeTasks = onSnapshot(tasksQuery, 
      (snapshot) => {
        const tasksData: Task[] = snapshot.docs.map(doc => {
          const data = doc.data() as Task;
          if (data.subTasks) {
            data.subTasks = data.subTasks.map(subTask => ({
              ...subTask,
              responsibleStaff: subTask.responsibleStaff || [],
              completionProgress: subTask.completionProgress || 0
            }));
          }
          return {
            id: doc.id,
            ...data,
          };
        });
        
        let filteredTasks = tasksData;
        if (user.role === 'staff') {
          if (viewMode === 'my-responsibilities') {
            filteredTasks = tasksData.filter(task => {
              if (task.staffId === user.uid) return true;
              if (task.subTasks) {
                return task.subTasks.some(subTask => 
                  subTask.responsibleStaff.some(staff => staff.id === user.uid)
                );
              }
              return false;
            });
          } else {
            filteredTasks = tasksData.filter(task => {
              if (task.staffId === user.uid) return true;
              if (task.createdBy === user.uid) return true;
              if (task.subTasks) {
                return task.subTasks.some(subTask => 
                  subTask.responsibleStaff.some(staff => staff.id === user.uid)
                );
              }
              return false;
            });
          }
        }
        
        setLoading(false);
        
        const updatedTasks = filteredTasks.map(task => {
          const now = new Date();
          const updatedSubTasks = task.subTasks?.map(subTask => {
            const deadline = new Date(subTask.deadline);
            if (subTask.status !== 'completed' && subTask.status !== 'closed' && deadline < now) {
              return { ...subTask, status: 'delayed' };
            }
            return subTask;
          });

          let overallProgress = 0;
          let allCompleted = true;
          let allClosed = true;
          let anyInProgress = false;
          let anyDelayed = false;

          if (updatedSubTasks && updatedSubTasks.length > 0) {
            const completedCount = updatedSubTasks.filter(st => st.status === 'completed').length;
            const closedCount = updatedSubTasks.filter(st => st.status === 'closed').length;
            overallProgress = ((completedCount + closedCount) / updatedSubTasks.length) * 100;
            allCompleted = updatedSubTasks.every(st => st.status === 'completed');
            allClosed = updatedSubTasks.every(st => st.status === 'closed');
            anyInProgress = updatedSubTasks.some(st => st.status === 'inprogress');
            anyDelayed = updatedSubTasks.some(st => st.status === 'delayed');
          }

          let mainStatus: TaskStatus = task.status;
          const mainDeadline = task.deadline instanceof Timestamp 
            ? task.deadline.toDate() 
            : new Date(task.deadline as string);

          // Don't override closed status
          if (task.status !== 'closed') {
            if (allClosed && updatedSubTasks && updatedSubTasks.length > 0) {
              mainStatus = 'closed';
            } else if (allCompleted && updatedSubTasks && updatedSubTasks.length > 0) {
              mainStatus = 'completed';
            } else if (anyDelayed || mainDeadline < now) {
              mainStatus = 'delayed';
            } else if (anyInProgress) {
              mainStatus = 'inprogress';
            } else if (task.status === 'assigned' && task.openedAt) {
              mainStatus = 'opened';
            }
          }

          return { 
            ...task,
            subTasks: updatedSubTasks,
            overallProgress,
            status: mainStatus
          };
        });
        
        setTasks(updatedTasks);
        
      },
      (error) => {
        console.error('Error fetching tasks:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeEmployees();
      unsubscribeTasks();
    };
  }, [user, viewMode]);

  // ============ HANDLERS ============
  
  const handleOpenTask = useCallback(async (task: Task) => {
    try {
      if (task.status === 'assigned') {
        const taskRef = doc(db, 'tasks', task.id);
        
        const openedBy = task.openedBy || [];
        if (user?.uid && !openedBy.includes(user.uid)) {
          openedBy.push(user.uid);
        }
        
        const updateData = {
          status: 'opened' as const,
          openedAt: Timestamp.fromDate(new Date()),
          openedBy: openedBy,
          updatedAt: serverTimestamp()
        };
        
        const cleanedData = cleanObjectForFirestore(updateData);
        await updateDoc(taskRef, cleanedData);
        
        console.log('Task opened successfully');
      }
    } catch (error) {
      console.error('Error opening task:', error);
    }
  }, [user]);

  const addResponsibleStaffToSubTask = useCallback((staffId: string) => {
    if (!selectedStaffForSubTask.includes(staffId)) {
      const employee = employees.find(emp => emp.id === staffId);
      if (employee) {
        setSelectedStaffForSubTask(prev => [...prev, staffId]);
        setCurrentSubTask(prev => ({
          ...prev,
          responsibleStaff: [
            ...prev.responsibleStaff,
            {
              id: employee.id,
              name: employee.employeeName,
              email: employee.email,
              status: 'pending',
              completedAt: null
            }
          ]
        }));
      }
    }
  }, [employees, selectedStaffForSubTask]);

  const removeResponsibleStaffFromSubTask = useCallback((staffId: string) => {
    setSelectedStaffForSubTask(prev => prev.filter(id => id !== staffId));
    setCurrentSubTask(prev => ({
      ...prev,
      responsibleStaff: prev.responsibleStaff.filter(staff => staff.id !== staffId)
    }));
  }, []);

  const addSubTask = useCallback(() => {
    if (!currentSubTask.description || !currentSubTask.deadline) {
      alert('Please fill description and deadline for the sub-task');
      return;
    }

    if (currentSubTask.responsibleStaff.length === 0) {
      alert('Please select at least one responsible staff member for the sub-task');
      return;
    }

    setNewTask(prev => ({
      ...prev,
      subTasks: [...prev.subTasks, { 
        ...currentSubTask, 
        id: Date.now().toString(),
        status: 'pending',
        completionProgress: 0,
        responsibleStaff: currentSubTask.responsibleStaff.map(staff => ({ ...staff, completedAt: null }))
      }]
    }));

    setCurrentSubTask({
      id: Date.now().toString(),
      description: '',
      priority: 'medium',
      deadline: '',
      status: 'pending',
      responsibleStaff: [],
      completionProgress: 0
    });
    setSelectedStaffForSubTask([]);
  }, [currentSubTask]);

  const removeSubTask = useCallback((id: string) => {
    setNewTask(prev => ({
      ...prev,
      subTasks: prev.subTasks.filter(st => st.id !== id)
    }));
  }, []);

  const updateSubTaskInEdit = useCallback((id: string, field: keyof SubTask, value: any) => {
    setEditSubTasks(prev => prev.map(st => 
      st.id === id ? { ...st, [field]: value } : st
    ));
  }, []);

  const addSubTaskToEdit = useCallback(() => {
    const newSubTask: SubTask = {
      id: Date.now().toString(),
      description: '',
      priority: 'medium',
      deadline: '',
      status: 'pending',
      responsibleStaff: [],
      completionProgress: 0
    };
    setEditSubTasks(prev => [...prev, newSubTask]);
  }, []);

  const removeSubTaskFromEdit = useCallback((id: string) => {
    setEditSubTasks(prev => prev.filter(st => st.id !== id));
  }, []);

  const addResponsibleStaffToEditSubTask = useCallback((subTaskId: string, staffId: string) => {
    const employee = employees.find(emp => emp.id === staffId);
    if (!employee) return;

    setEditSubTasks(prev => prev.map(subTask => {
      if (subTask.id === subTaskId) {
        const existingStaff = subTask.responsibleStaff || [];
        if (!existingStaff.some(s => s.id === staffId)) {
          return {
            ...subTask,
            responsibleStaff: [...existingStaff, {
              id: employee.id,
              name: employee.employeeName,
              email: employee.email,
              status: 'pending',
              completedAt: null
            }]
          };
        }
      }
      return subTask;
    }));
  }, [employees]);

  const removeResponsibleStaffFromEditSubTask = useCallback((subTaskId: string, staffId: string) => {
    setEditSubTasks(prev => prev.map(subTask => {
      if (subTask.id === subTaskId) {
        return {
          ...subTask,
          responsibleStaff: (subTask.responsibleStaff || []).filter(s => s.id !== staffId)
        };
      }
      return subTask;
    }));
  }, []);

  const updateResponsibleStaffStatus = useCallback(async (taskId: string, subTaskId: string, staffId: string, newStatus: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.subTasks) return;

      const updatedSubTasks = task.subTasks.map(subTask => {
        if (subTask.id === subTaskId) {
          const responsibleStaff = subTask.responsibleStaff || [];
          const updatedStaff = responsibleStaff.map(staff => {
            if (staff.id === staffId) {
              const updatedStaffMember: ResponsibleStaff = {
                ...staff,
                status: newStatus as any
              };
              if (newStatus === 'completed' || newStatus === 'closed') {
                updatedStaffMember.completedAt = new Date();
              } else {
                updatedStaffMember.completedAt = null;
              }
              return updatedStaffMember;
            }
            return staff;
          });
          
          // Calculate sub-task status based on staff statuses
          const allClosed = updatedStaff.length > 0 && updatedStaff.every(staff => staff.status === 'closed');
          const allCompleted = updatedStaff.length > 0 && updatedStaff.every(staff => staff.status === 'completed');
          const anyCompletedOrClosed = updatedStaff.some(staff => staff.status === 'completed' || staff.status === 'closed');
          const anyInProgress = updatedStaff.some(staff => staff.status === 'inprogress');
          const anyDelayed = updatedStaff.some(staff => staff.status === 'delayed');
          
          let subTaskStatus = subTask.status;
          if (allClosed) {
            subTaskStatus = 'closed';
          } else if (allCompleted) {
            subTaskStatus = 'completed';
          } else if (anyDelayed) {
            subTaskStatus = 'delayed';
          } else if (anyInProgress) {
            subTaskStatus = 'inprogress';
          } else if (anyCompletedOrClosed) {
            subTaskStatus = 'inprogress';
          } else {
            subTaskStatus = 'pending';
          }
          
          // Calculate progress including closed as completed
          const completionProgress = updatedStaff.length > 0 
            ? (updatedStaff.filter(staff => staff.status === 'completed' || staff.status === 'closed').length / updatedStaff.length) * 100 
            : 0;
          
          return { ...subTask, responsibleStaff: updatedStaff, status: subTaskStatus, completionProgress };
        }
        return subTask;
      });

      // Calculate overall task progress
      const totalSubTasks = updatedSubTasks.length;
      const closedSubTasks = updatedSubTasks.filter(st => st.status === 'closed').length;
      const completedSubTasks = updatedSubTasks.filter(st => st.status === 'completed').length;
      const inProgressSubTasks = updatedSubTasks.filter(st => st.status === 'inprogress').length;
      const delayedSubTasks = updatedSubTasks.filter(st => st.status === 'delayed').length;
      
      // Count closed as completed for progress calculation
      const effectiveCompleted = completedSubTasks + closedSubTasks;
      const overallProgress = totalSubTasks > 0 ? (effectiveCompleted / totalSubTasks) * 100 : 0;
      
      let mainStatus: TaskStatus = task.status;
      
      if (task.status !== 'closed') {
        if (closedSubTasks === totalSubTasks && totalSubTasks > 0) {
          mainStatus = 'closed';
        } else if (effectiveCompleted === totalSubTasks && totalSubTasks > 0) {
          mainStatus = 'completed';
        } else if (delayedSubTasks > 0) {
          mainStatus = 'delayed';
        } else if (inProgressSubTasks > 0 || completedSubTasks > 0 || closedSubTasks > 0) {
          mainStatus = 'inprogress';
        } else if (task.status === 'assigned' || task.status === 'opened') {
          mainStatus = 'opened';
        }
      }

      const cleanSubTasks = updatedSubTasks.map(subTask => ({
        ...subTask,
        responsibleStaff: subTask.responsibleStaff.map(staff => ({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          status: staff.status || 'pending',
          completedAt: staff.completedAt || null
        }))
      }));

      const updateData = {
        subTasks: cleanSubTasks,
        status: mainStatus,
        overallProgress,
        updatedAt: serverTimestamp()
      };

      const cleanedData = cleanObjectForFirestore(updateData);
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, cleanedData);
      
      if (newStatus === 'closed') {
        alert('Task marked as closed!');
      } else if (newStatus === 'completed') {
        alert('Task marked as completed!');
      } else if (newStatus === 'inprogress') {
        alert('Task marked as in progress');
      }
      
    } catch (error) {
      console.error('Error updating responsible staff status:', error);
      alert('Failed to update staff status');
    }
  }, [tasks]);

  const handleAssignTask = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTask.staffId) {
      alert('Please select an employee');
      return;
    }

    if (newTask.subTasks.length === 0) {
      alert('Please add at least one sub-task');
      return;
    }

    try {
      const selectedEmployee = employees.find(emp => emp.id === newTask.staffId);
      
      if (!selectedEmployee) {
        alert('Selected employee not found');
        return;
      }

      const mainTaskDeadline = new Date(Math.max(...newTask.subTasks.map(st => new Date(st.deadline).getTime())));
      
      const priorities = newTask.subTasks.map(st => st.priority);
      let mainPriority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (priorities.includes('critical')) mainPriority = 'critical';
      else if (priorities.includes('high')) mainPriority = 'high';
      else if (priorities.includes('medium')) mainPriority = 'medium';
      else mainPriority = 'low';

      const now = new Date();
      
      const taskData = {
        staffId: newTask.staffId,
        employeeName: selectedEmployee.employeeName,
        status: 'assigned' as const,
        deadline: Timestamp.fromDate(mainTaskDeadline),
        task: `${newTask.subTasks.length} tasks assigned`,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
        assignedBy: user.uid,
        assignedByName: user.name || user.email,
        createdBy: user.uid,
        createdByName: user.name || user.email,
        category: newTask.category,
        priority: mainPriority,
        primaryResponsibility: newTask.subTasks.flatMap(st => st.responsibleStaff?.map(rs => rs.id) || []),
        additionalNotes: newTask.additionalNotes,
        subTasks: newTask.subTasks.map(st => ({ 
          ...st, 
          status: 'pending',
          completionProgress: 0,
          responsibleStaff: st.responsibleStaff?.map(rs => ({ 
            ...rs, 
            status: 'pending',
            completedAt: null 
          })) || []
        })),
        isGroupTask: true,
        overallProgress: 0,
        openedAt: null,
        openedBy: []
      };

      const cleanedData = cleanObjectForFirestore(taskData);
      await addDoc(collection(db, 'tasks'), cleanedData);

      // Trigger email notification for the assigned staff member
      if (selectedEmployee.email) {
        try {
          const subject = encodeURIComponent(`New Task Assigned: ${newTask.category || 'General Task'}`);
          const body = encodeURIComponent(
            `Hello ${selectedEmployee.employeeName},\n\n` +
            `You have been assigned a new task on the iBots Dashboard by ${user.name || user.email}.\n\n` +
            `Category: ${newTask.category || 'General'}\n` +
            `Deadline: ${mainTaskDeadline.toLocaleString()}\n` +
            `Priority: ${mainPriority}\n\n` +
            `Sub-Tasks:\n` +
            newTask.subTasks.map((st, i) => `${i + 1}. ${st.description} (Deadline: ${st.deadline}, Priority: ${st.priority})`).join('\n') +
            `\n\nNotes: ${newTask.additionalNotes || 'N/A'}\n\n` +
            `Please access your tasks dashboard at https://dashboard.ibots.in/task to view details.\n\n` +
            `Thank you,\niBots Management`
          );
          window.open(`mailto:${selectedEmployee.email}?subject=${subject}&body=${body}`, '_blank');
        } catch (e) {
          console.log('Email notification popup skipped:', e);
        }
      }
      
      setNewTask({
        staffId: '',
        category: '',
        additionalNotes: '',
        subTasks: []
      });
      setIsAddModalOpen(false);
      alert(`Task assigned successfully to ${selectedEmployee.employeeName}! Email notification prepared.`);
      
    } catch (error) {
      console.error('Error assigning task:', error);
      alert('Failed to assign task');
    }
  }, [newTask, employees, user]);

  const handleEditTask = useCallback((task: Task) => {
    setSelectedTask(task);
    setEditForm({
      task: task.task,
      deadline: task.deadline instanceof Timestamp 
        ? task.deadline.toDate().toISOString().slice(0, 16)
        : new Date(task.deadline as string).toISOString().slice(0, 16),
      status: task.status,
      category: task.category,
      priority: task.priority,
      primaryResponsibility: task.primaryResponsibility,
      additionalNotes: task.additionalNotes
    });
    setEditSubTasks(task.subTasks || []);
    setIsEditModalOpen(true);
  }, []);

  const handleUpdateTask = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    try {
      const taskRef = doc(db, 'tasks', selectedTask.id);
      
      const mainTaskDeadline = editSubTasks.length > 0 
        ? new Date(Math.max(...editSubTasks.map(st => new Date(st.deadline).getTime())))
        : new Date(editForm.deadline as string);
      
      const priorities = editSubTasks.map(st => st.priority);
      let mainPriority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (priorities.includes('critical')) mainPriority = 'critical';
      else if (priorities.includes('high')) mainPriority = 'high';
      else if (priorities.includes('medium')) mainPriority = 'medium';
      else mainPriority = 'low';
      
      const updateData: any = {
        category: editForm.category,
        priority: mainPriority,
        deadline: Timestamp.fromDate(mainTaskDeadline),
        task: `${editSubTasks.length} tasks assigned`,
        additionalNotes: editForm.additionalNotes,
        subTasks: editSubTasks.map(st => ({
          ...st,
          responsibleStaff: st.responsibleStaff.map(rs => ({
            ...rs,
            status: rs.status || 'pending',
            completedAt: rs.completedAt || null
          }))
        })),
        updatedAt: serverTimestamp()
      };

      const cleanedData = cleanObjectForFirestore(updateData);
      await updateDoc(taskRef, cleanedData);
      setIsEditModalOpen(false);
      setSelectedTask(null);
      alert('Task updated successfully!');
      
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task');
    }
  }, [selectedTask, editForm, editSubTasks]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await deleteDoc(taskRef);
      setIsDeleteConfirmOpen(false);
      setTaskToDelete(null);
      alert('Task deleted successfully!');
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  }, []);

  const handleViewTask = useCallback(async (task: Task) => {
    setViewingTask(task);
    setIsViewModalOpen(true);
    
    if (task.status === 'assigned') {
      await handleOpenTask(task);
    }
  }, [handleOpenTask]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const getInitials = useCallback((name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, []);

  const isUserResponsible = useCallback((task: Task): boolean => {
    if (!user) return false;
    if (task.staffId === user.uid) return true;
    if (task.subTasks) {
      return task.subTasks.some(subTask =>
        subTask.responsibleStaff.some(staff => staff.id === user.uid)
      );
    }
    return false;
  }, [user]);

  const isTaskCreator = useCallback((task: Task): boolean => {
    return task.createdBy === user?.uid;
  }, [user]);

  const getUserRoleInTask = useCallback((task: Task): string => {
    if (!user) return '';
    if (task.createdBy === user.uid) return 'Creator';
    if (task.staffId === user.uid) return 'Assignee';
    if (task.subTasks) {
      const subTask = task.subTasks.find(st =>
        st.responsibleStaff.some(staff => staff.id === user.uid)
      );
      if (subTask) {
        const staff = subTask.responsibleStaff.find(s => s.id === user.uid);
        return `Responsible: ${staff?.status || 'pending'}`;
      }
    }
    return '';
  }, [user]);

  const canAssignTask = useCallback((): boolean => {
    return user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';
  }, [user]);

  const canEditTask = useCallback((task: Task): boolean => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'manager' && task.createdBy === user?.uid) return true;
    if (user?.role === 'staff' && task.createdBy === user?.uid) return true;
    return false;
  }, [user]);

  const canDeleteTask = useCallback((task: Task): boolean => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'manager' && task.createdBy === user?.uid) return true;
    if (user?.role === 'staff' && task.createdBy === user?.uid) return true;
    return false;
  }, [user]);

  const canUpdateStatus = useCallback((task: Task): boolean => {
    if (user?.role === 'admin') return true;
    if (task.staffId === user?.uid) return true;
    if (isUserResponsible(task)) return true;
    return false;
  }, [user, isUserResponsible]);

  const canViewAllTasks = useCallback((): boolean => {
    return user?.role === 'admin' || user?.role === 'manager';
  }, [user]);

  // Calculate statistics - UPDATED to count subtasks instead of main tasks
  const subTaskStats = useMemo(() => getOverallSubTaskStats(tasks), [tasks]);

  const priorityStats = useMemo(() => {
    // Count priorities across all subtasks
    let critical = 0, high = 0, medium = 0, low = 0;
    tasks.forEach(task => {
      if (task.subTasks) {
        task.subTasks.forEach(subTask => {
          switch (subTask.priority) {
            case 'critical': critical++; break;
            case 'high': high++; break;
            case 'medium': medium++; break;
            case 'low': low++; break;
          }
        });
      }
    });
    return { critical, high, medium, low };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    
    if (searchTerm && canViewAllTasks()) {
      filtered = filtered.filter(task =>
        task.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.assignedByName && task.assignedByName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (task.category && task.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (task.createdByName && task.createdByName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    } else if (searchTerm && user?.role === 'staff') {
      filtered = filtered.filter(task =>
        task.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.category && task.category.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(task => task.status === filterStatus);
    }
    
    if (filterPriority !== 'all') {
      filtered = filtered.filter(task => task.priority === filterPriority);
    }
    
    filtered = [...filtered].sort((a, b) => {
      let aValue: any, bValue: any;
      
      if (sortField === 'deadline' || sortField === 'createdAt' || sortField === 'updatedAt') {
        aValue = a[sortField] instanceof Timestamp 
          ? (a[sortField] as Timestamp).toDate() 
          : new Date(a[sortField] as string);
        bValue = b[sortField] instanceof Timestamp 
          ? (b[sortField] as Timestamp).toDate() 
          : new Date(b[sortField] as string);
      } else {
        aValue = a[sortField];
        bValue = b[sortField];
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  }, [tasks, searchTerm, filterStatus, filterPriority, sortField, sortDirection, canViewAllTasks, user]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTasks.length);
  const paginatedTasks = useMemo(() => {
    return filteredTasks.slice(startIndex, endIndex);
  }, [filteredTasks, startIndex, endIndex]);

  // Component to render status breakdown for a task's sub-tasks
  const renderSubTaskStatusBreakdown = useCallback((subTasks: SubTask[] | undefined) => {
    const counts = getSubTaskStatusCounts(subTasks);
    if (counts.total === 0) {
      return <span className="text-xs text-gray-400">No sub-tasks</span>;
    }
    
    const completedOrClosed = counts.completed + counts.closed;
    const percentage = (completedOrClosed / counts.total) * 100;
    
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          {counts.completed > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3" />
              {counts.completed}
            </span>
          )}
          {counts.closed > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
              <CircleX className="w-3 h-3" />
              {counts.closed}
            </span>
          )}
          {counts.inprogress > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
              <Clock className="w-3 h-3" />
              {counts.inprogress}
            </span>
          )}
          {counts.delayed > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
              <AlertCircle className="w-3 h-3" />
              {counts.delayed}
            </span>
          )}
          {counts.pending > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
              <Circle className="w-3 h-3" />
              {counts.pending}
            </span>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div 
            className="h-1 rounded-full bg-gradient-to-r from-green-500 via-gray-500 to-red-500"
            style={{ 
              width: `${percentage}%` 
            }}
          />
        </div>
        <div className="text-xs text-gray-500">
          {completedOrClosed} of {counts.total} completed/closed
        </div>
      </div>
    );
  }, []);

  // Component to render priority breakdown for a task's sub-tasks
  const renderSubTaskPriorityBreakdown = useCallback((subTasks: SubTask[] | undefined) => {
    const counts = getSubTaskPriorityCounts(subTasks);
    if (counts.total === 0) {
      return <span className="text-xs text-gray-400">No sub-tasks</span>;
    }
    
    return (
      <div className="flex flex-wrap gap-1">
        {counts.critical > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
            <CircleAlert className="w-3 h-3" />
            {counts.critical}
          </span>
        )}
        {counts.high > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
            <Flag className="w-3 h-3" />
            {counts.high}
          </span>
        )}
        {counts.medium > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
            <Flag className="w-3 h-3" />
            {counts.medium}
          </span>
        )}
        {counts.low > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
            <Flag className="w-3 h-3" />
            {counts.low}
          </span>
        )}
      </div>
    );
  }, []);

  // ============ RENDER FUNCTIONS ============
  const renderSubTasks = useCallback((task: Task, isViewOnly: boolean = false) => {
    if (!task.subTasks || task.subTasks.length === 0) return null;

    return (
      <div className="mt-4 space-y-3">
        <h5 className="font-semibold text-gray-700 text-sm">Sub-Tasks:</h5>
        <div className="space-y-3">
          {task.subTasks.map((subTask, index) => {
            const responsibleStaff = subTask.responsibleStaff || [];
            const canUpdate = canUpdateStatus(task);
            
            return (
              <div key={subTask.id} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">
                          Task {index + 1}:
                        </span>
                        <span className="text-gray-700 text-sm break-words">
                          {subTask.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(subTask.priority)}`}>
                          <Flag className="w-3 h-3 mr-1" />
                          {subTask.priority}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          Deadline: {formatDate(new Date(subTask.deadline))}
                        </span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSubTaskStatusColor(subTask.status)}`}>
                          Status: {subTask.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">Responsible Staff:</p>
                    <div className="space-y-2">
                      {responsibleStaff.length > 0 ? (
                        responsibleStaff.map((staff) => {
                          const isCurrentUser = user?.uid === staff.id;
                          return (
                            <div key={staff.id} className={`flex items-center justify-between rounded-lg p-2 ${isCurrentUser ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#7889F5] to-[#A5AEFF] flex items-center justify-center text-white font-semibold text-xs">
                                  {getInitials(staff.name)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {staff.name}
                                    {isCurrentUser && <span className="ml-2 text-xs text-blue-600">(You)</span>}
                                  </p>
                                  <p className="text-xs text-gray-500">{staff.email}</p>
                                </div>
                              </div>
                              {!isViewOnly && canUpdate && (
                                <select
                                  value={staff.status || 'pending'}
                                  onChange={(e) => updateResponsibleStaffStatus(task.id, subTask.id, staff.id, e.target.value)}
                                  className={`px-2 py-1 rounded-full text-xs font-medium border ${getSubTaskStatusColor(staff.status || 'pending')} focus:outline-none`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="inprogress">In Progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="closed">Closed</option>
                                </select>
                              )}
                              {isViewOnly && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSubTaskStatusColor(staff.status || 'pending')}`}>
                                  {staff.status || 'pending'}
                                </span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-gray-500 italic">No responsible staff assigned</p>
                      )}
                    </div>
                    {subTask.completionProgress !== undefined && subTask.completionProgress > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{Math.round(subTask.completionProgress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${subTask.completionProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [user, canUpdateStatus, updateResponsibleStaffStatus, getInitials]);

  const renderPriorityBadge = useCallback((priority: string) => (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(priority)}`}>
      <div className={`w-2 h-2 rounded-full mr-1.5 ${
        priority === 'critical' ? 'bg-red-500' :
        priority === 'high' ? 'bg-orange-500' :
        priority === 'medium' ? 'bg-yellow-500' :
        'bg-green-500'
      }`} />
      {getPriorityIcon(priority)}
      <span className="ml-1 capitalize">{priority}</span>
    </span>
  ), []);

  const renderStatusBadge = useCallback((status: TaskStatus) => (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
      {getStatusIcon(status)}
      <span className="ml-1 capitalize">{status}</span>
    </span>
  ), []);

  const renderProgressBar = useCallback((progress: number = 0) => (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>Overall Progress</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-green-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  ), []);

  // ============ MODAL RENDER FUNCTIONS ============
  const renderViewModal = useCallback(() => {
    if (!viewingTask) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl w-full max-w-4xl p-4 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 md:mb-8 sticky top-0 bg-white pb-4 border-b">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">Task Details</h2>
            <button onClick={() => setIsViewModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Task Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    <span>Assigned to: <span className="font-semibold ml-1">{viewingTask.employeeName}</span></span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    <span>Created by: <span className="font-semibold ml-1">{viewingTask.createdByName || viewingTask.assignedByName}</span></span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>Main Deadline: <span className="font-semibold ml-1">{formatDate(viewingTask.deadline)}</span></span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Tag className="w-4 h-4 mr-2" />
                    <span>Category: <span className="font-semibold ml-1">{viewingTask.category}</span></span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Flag className="w-4 h-4 mr-2" />
                    <span>Priority: <span className="font-semibold ml-1">{renderPriorityBadge(viewingTask.priority || 'medium')}</span></span>
                  </div>
                  <div className="flex items-center text-gray-600">
                    {renderStatusBadge(viewingTask.status)}
                  </div>
                  {viewingTask.openedAt && (
                    <div className="flex items-center text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>First Opened: <span className="font-semibold ml-1">{formatDateTime(viewingTask.openedAt)}</span></span>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Your Role</h3>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-800">{getUserRoleInTask(viewingTask)}</p>
                </div>
                {viewingTask.additionalNotes && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Additional Notes</h3>
                    <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg">{viewingTask.additionalNotes}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Sub-Tasks</h3>
              {renderSubTasks(viewingTask, true)}
            </div>
            
            {viewingTask.overallProgress !== undefined && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Overall Progress</h3>
                {renderProgressBar(viewingTask.overallProgress)}
              </div>
            )}
          </div>
          
          <div className="mt-8 flex justify-end">
            <button onClick={() => setIsViewModalOpen(false)} className="px-6 py-3 rounded-xl bg-gray-600 text-white hover:bg-gray-700 transition-all font-medium">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }, [viewingTask, renderPriorityBadge, renderStatusBadge, getUserRoleInTask, renderSubTasks, renderProgressBar]);

  const renderAddTaskModal = useCallback(() => {
    const availableEmployees = employees.filter(emp => {
      if (user.role === 'staff') return emp.id === user.uid;
      return true;
    });

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl w-full max-w-5xl p-4 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 md:mb-8 sticky top-0 bg-white pb-4 border-b">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">{user.role === 'staff' ? 'Create New Task' : 'Assign New Task'}</h2>
            <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
          
          <form onSubmit={handleAssignTask}>
            <div className="space-y-6 md:space-y-8">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Select Employee *</label>
                <select
                  value={newTask.staffId}
                  onChange={(e) => setNewTask(prev => ({ ...prev, staffId: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white"
                  required
                  disabled={user.role === 'staff'}
                >
                  <option value="">Select an employee</option>
                  {availableEmployees.map(employee => (
                    <option key={employee.id} value={employee.id}>{employee.employeeName} ({employee.role})</option>
                  ))}
                </select>
                {user.role === 'staff' && (
                  <p className="text-xs text-blue-600 mt-1">✓ You are automatically selected as the assignee</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Category *</label>
                <select
                  value={newTask.category}
                  onChange={(e) => setNewTask(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white"
                  required
                >
                  <option value="">Select category</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="training">Training</option>
                  <option value="project">Project</option>
                  <option value="development">Development</option>
                  <option value="design">Design</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Sub-Tasks *</label>
                
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <h4 className="font-medium text-gray-900 mb-3">Add New Sub-Task</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Description *</label>
                      <textarea
                        value={currentSubTask.description}
                        onChange={(e) => setCurrentSubTask(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                        placeholder="Enter sub-task description..."
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Priority *</label>
                        <select
                          value={currentSubTask.priority}
                          onChange={(e) => setCurrentSubTask(prev => ({ ...prev, priority: e.target.value as any }))}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Deadline *</label>
                        <input
                          type="datetime-local"
                          value={currentSubTask.deadline}
                          onChange={(e) => setCurrentSubTask(prev => ({ ...prev, deadline: e.target.value }))}
                          className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Responsible Staff Members (Multiple) *</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {employees.map(employee => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => addResponsibleStaffToSubTask(employee.id)}
                            disabled={selectedStaffForSubTask.includes(employee.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${selectedStaffForSubTask.includes(employee.id) ? 'bg-green-600 text-white cursor-default' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                          >
                            {employee.employeeName}
                          </button>
                        ))}
                      </div>
                      {currentSubTask.responsibleStaff.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-2">
                          <p className="text-xs text-blue-800 font-medium mb-1">Selected Staff:</p>
                          <div className="flex flex-wrap gap-1">
                            {currentSubTask.responsibleStaff.map(staff => (
                              <span key={staff.id} className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                {staff.name}
                                <button type="button" onClick={() => removeResponsibleStaffFromSubTask(staff.id)} className="ml-1 hover:text-blue-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <button type="button" onClick={addSubTask} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center">
                      <Plus className="w-4 h-4 mr-2" /> Add Sub-Task
                    </button>
                  </div>
                </div>

                {newTask.subTasks.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">Added Sub-Tasks ({newTask.subTasks.length})</h4>
                    {newTask.subTasks.map((subTask, index) => (
                      <div key={subTask.id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">#{index + 1}</span>
                              <span className="text-gray-700 text-sm break-words">{subTask.description}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(subTask.priority)}`}>{subTask.priority}</span>
                              <span className="text-xs text-gray-500 flex items-center"><Calendar className="w-3 h-3 mr-1" />{formatDate(new Date(subTask.deadline))}</span>
                            </div>
                            <div className="mt-2">
                              <p className="text-xs text-gray-600">Responsible Staff:</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {subTask.responsibleStaff.map(staff => (
                                  <span key={staff.id} className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">{staff.name}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <button type="button" onClick={() => removeSubTask(subTask.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Additional Notes</label>
                <textarea
                  value={newTask.additionalNotes}
                  onChange={(e) => setNewTask(prev => ({ ...prev, additionalNotes: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all min-h-[100px]"
                  placeholder="Add any additional notes..."
                />
              </div>
            </div>

            <div className="my-6 md:my-8 border-t border-gray-200"></div>

            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
              <button type="submit" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-md hover:shadow-lg">
                {user.role === 'staff' ? 'Create Task' : 'Assign Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }, [user, employees, newTask, currentSubTask, selectedStaffForSubTask, addResponsibleStaffToSubTask, removeResponsibleStaffFromSubTask, addSubTask, removeSubTask, handleAssignTask]);

  const renderEditTaskModal = useCallback(() => {
    if (!selectedTask) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl w-full max-w-5xl p-4 md:p-8 my-8 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 md:mb-8 sticky top-0 bg-white pb-4 border-b">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">Edit Task</h2>
            <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
          
          <form onSubmit={handleUpdateTask}>
            <div className="space-y-6 md:space-y-8">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Category *</label>
                <select
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white"
                  required
                >
                  <option value="">Select category</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="training">Training</option>
                  <option value="project">Project</option>
                  <option value="development">Development</option>
                  <option value="design">Design</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Sub-Tasks *</label>
                
                <button type="button" onClick={addSubTaskToEdit} className="mb-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center">
                  <Plus className="w-4 h-4 mr-2" /> Add Sub-Task
                </button>

                {editSubTasks.length > 0 ? (
                  <div className="space-y-4">
                    {editSubTasks.map((subTask, index) => (
                      <div key={subTask.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-medium text-gray-900">Sub-Task #{index + 1}</h4>
                          <button type="button" onClick={() => removeSubTaskFromEdit(subTask.id)} className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">Description *</label>
                            <textarea
                              value={subTask.description}
                              onChange={(e) => updateSubTaskInEdit(subTask.id, 'description', e.target.value)}
                              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                              placeholder="Enter sub-task description..."
                              rows={2}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">Priority *</label>
                              <select
                                value={subTask.priority}
                                onChange={(e) => updateSubTaskInEdit(subTask.id, 'priority', e.target.value as any)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">Deadline *</label>
                              <input
                                type="datetime-local"
                                value={subTask.deadline}
                                onChange={(e) => updateSubTaskInEdit(subTask.id, 'deadline', e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">Responsible Staff Members *</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {employees.map(employee => {
                                const isSelected = (subTask.responsibleStaff || []).some(s => s.id === employee.id);
                                return (
                                  <button
                                    key={employee.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        removeResponsibleStaffFromEditSubTask(subTask.id, employee.id);
                                      } else {
                                        addResponsibleStaffToEditSubTask(subTask.id, employee.id);
                                      }
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                  >
                                    {employee.employeeName}
                                  </button>
                                );
                              })}
                            </div>
                            {(subTask.responsibleStaff || []).length > 0 && (
                              <div className="bg-blue-50 rounded-lg p-2">
                                <p className="text-xs text-blue-800 font-medium mb-1">Selected Staff:</p>
                                <div className="flex flex-wrap gap-1">
                                  {subTask.responsibleStaff.map(staff => (
                                    <span key={staff.id} className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                      {staff.name}
                                      <button type="button" onClick={() => removeResponsibleStaffFromEditSubTask(subTask.id, staff.id)} className="ml-1 hover:text-blue-600">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No sub-tasks added. Click "Add Sub-Task" to create one.</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Additional Notes</label>
                <textarea
                  value={editForm.additionalNotes || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, additionalNotes: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all min-h-[100px]"
                  placeholder="Add any additional notes..."
                />
              </div>
            </div>

            <div className="my-6 md:my-8 border-t border-gray-200"></div>

            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
              <button type="submit" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-md hover:shadow-lg">Update Task</button>
            </div>
          </form>
        </div>
      </div>
    );
  }, [selectedTask, editForm, editSubTasks, employees, addSubTaskToEdit, removeSubTaskFromEdit, updateSubTaskInEdit, addResponsibleStaffToEditSubTask, removeResponsibleStaffFromEditSubTask, handleUpdateTask]);

  const renderDeleteConfirmModal = useCallback(() => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 transform transition-all duration-300 scale-100">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Task</h3>
          <p className="text-gray-600">Are you sure you want to delete this task? This action cannot be undone.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-3">
          <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
          <button onClick={() => taskToDelete && handleDeleteTask(taskToDelete)} className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 transition-all font-medium shadow-md hover:shadow-lg">Delete Task</button>
        </div>
      </div>
    </div>
  ), [taskToDelete, handleDeleteTask]);

  // ============ MAIN RENDER ============
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F6FC] flex items-center justify-center">
        <div className="text-center p-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6FC] flex items-center justify-center">
        <div className="text-center p-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading tasks...</p>
        </div>
      </div>
    );
  }

  // Calculate main task status counts (for filtering)
  const mainTaskStatusCounts = {
    total: tasks.length,
    assigned: tasks.filter(t => t.status === 'assigned').length,
    opened: tasks.filter(t => t.status === 'opened').length,
    inprogress: tasks.filter(t => t.status === 'inprogress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    delayed: tasks.filter(t => t.status === 'delayed').length,
    closed: tasks.filter(t => t.status === 'closed').length,
  };

  const myTasksCount = tasks.filter(t => isUserResponsible(t)).length;
  const createdByMeCount = tasks.filter(t => t.createdBy === user.uid).length;

  return (
    <div className="min-h-screen bg-[#F5F6FC] p-3 md:p-6 lg:p-8">
      <TaskDashboard />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Task Management</h1>
          </div>
          
          <div className="flex gap-3 mt-4 md:mt-0">
            {user.role === 'staff' && (
              <button onClick={() => setViewMode(viewMode === 'all' ? 'my-responsibilities' : 'all')} className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${viewMode === 'my-responsibilities' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                <Users className="w-4 h-4" />
                {viewMode === 'my-responsibilities' ? 'My Responsibilities' : 'All My Tasks'}
              </button>
            )}
            {canAssignTask() && (
              <button onClick={() => setIsAddModalOpen(true)} className="px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center shadow-md hover:shadow-lg text-sm md:text-base">
                <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                {user.role === 'staff' ? 'Create New Task' : 'Assign New Task'}
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards - Now showing SUBTASK counts */}
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">📊 Subtask Statistics (across all tasks)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">Total Subtasks</p>
              <p className="text-xl font-bold text-gray-900">{subTaskStats.total}</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-xl font-bold text-gray-600">{subTaskStats.pending}</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">In Progress</p>
              <p className="text-xl font-bold text-blue-600">{subTaskStats.inprogress}</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">Completed</p>
              <p className="text-xl font-bold text-green-600">{subTaskStats.completed}</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">Delayed</p>
              <p className="text-xl font-bold text-red-600">{subTaskStats.delayed}</p>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500">Closed</p>
              <p className="text-xl font-bold text-gray-600">{subTaskStats.closed}</p>
            </div>
            {user.role === 'staff' && (
              <div className="bg-green-50 rounded-xl p-3 shadow-sm border border-green-200">
                <p className="text-xs text-green-600">Tasks Created by Me</p>
                <p className="text-xl font-bold text-green-700">{createdByMeCount}</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Task Status Filters */}
        <div className="bg-white rounded-2xl p-4 md:p-6 mb-6 md:mb-8 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-2">📋 Filter by Main Task Status</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => { setFilterStatus('all'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'all' && filterPriority === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              All Tasks ({mainTaskStatusCounts.total})
            </button>
            <button 
              onClick={() => { setFilterStatus('assigned'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'assigned' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
            >
              Assigned ({mainTaskStatusCounts.assigned})
            </button>
            <button 
              onClick={() => { setFilterStatus('opened'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'opened' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
            >
              Opened ({mainTaskStatusCounts.opened})
            </button>
            <button 
              onClick={() => { setFilterStatus('inprogress'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'inprogress' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
            >
              In Progress ({mainTaskStatusCounts.inprogress})
            </button>
            <button 
              onClick={() => { setFilterStatus('completed'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'completed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
            >
              Completed ({mainTaskStatusCounts.completed})
            </button>
            <button 
              onClick={() => { setFilterStatus('delayed'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'delayed' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
            >
              Delayed ({mainTaskStatusCounts.delayed})
            </button>
            <button 
              onClick={() => { setFilterStatus('closed'); setFilterPriority('all'); }} 
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${filterStatus === 'closed' ? 'bg-gray-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
            >
              Closed ({mainTaskStatusCounts.closed})
            </button>
          </div>
          
          {/* Priority filter buttons - now showing subtask priority counts */}
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <span className="text-xs text-gray-500 mr-1">Priority (across subtasks):</span>
            <button 
              onClick={() => setFilterPriority('all')} 
              className={`px-2 py-1 rounded text-xs font-medium ${filterPriority === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              All
            </button>
            <button 
              onClick={() => setFilterPriority('critical')} 
              className={`px-2 py-1 rounded text-xs font-medium ${filterPriority === 'critical' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
            >
              Critical ({priorityStats.critical})
            </button>
            <button 
              onClick={() => setFilterPriority('high')} 
              className={`px-2 py-1 rounded text-xs font-medium ${filterPriority === 'high' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700'}`}
            >
              High ({priorityStats.high})
            </button>
            <button 
              onClick={() => setFilterPriority('medium')} 
              className={`px-2 py-1 rounded text-xs font-medium ${filterPriority === 'medium' ? 'bg-yellow-600 text-white' : 'bg-yellow-50 text-yellow-700'}`}
            >
              Medium ({priorityStats.medium})
            </button>
            <button 
              onClick={() => setFilterPriority('low')} 
              className={`px-2 py-1 rounded text-xs font-medium ${filterPriority === 'low' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'}`}
            >
              Low ({priorityStats.low})
            </button>
          </div>
        </div>

        {isBannerVisible && (
          <ItemLocatedBanner
            itemLabel="Task"
            title={targetName || targetSearch || undefined}
            onClear={() => {
              clearHighlight();
              setSearchTerm('');
            }}
          />
        )}

        {/* Search */}
        <div className="bg-white rounded-2xl p-4 md:p-6 mb-6 md:mb-8 shadow-sm border border-gray-200">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
            <input 
              type="text" 
              placeholder="Search by employee name, task, category..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 md:pl-12 pr-4 py-2 md:py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all text-sm md:text-base" 
            />
          </div>
        </div>

        {/* Tasks Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {filteredTasks.length > 0 ? (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <button onClick={() => handleSort('employeeName')} className="flex items-center font-semibold text-gray-700 hover:text-gray-900 text-xs md:text-sm">
                        Employee
                        {sortField === 'employeeName' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                      </button>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <button onClick={() => handleSort('task')} className="flex items-center font-semibold text-gray-700 hover:text-gray-900 text-xs md:text-sm">
                        Task
                        {sortField === 'task' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                      </button>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <div className="flex items-center gap-1 font-semibold text-gray-700 text-xs md:text-sm">
                        <ListChecks className="w-3 h-3" />
                        Status
                      </div>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <div className="flex items-center gap-1 font-semibold text-gray-700 text-xs md:text-sm">
                        <Flag className="w-3 h-3" />
                        Priority
                      </div>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <button onClick={() => handleSort('category')} className="flex items-center font-semibold text-gray-700 hover:text-gray-900 text-xs md:text-sm">
                        Category
                        {sortField === 'category' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                      </button>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <button onClick={() => handleSort('deadline')} className="flex items-center font-semibold text-gray-700 hover:text-gray-900 text-xs md:text-sm">
                        Deadline
                        {sortField === 'deadline' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                      </button>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-center">
                      <div className="flex items-center justify-center gap-1 font-semibold text-gray-700 text-xs md:text-sm">
                        <PieChart className="w-3 h-3" />
                        Progress
                      </div>
                    </th>
                    <th className="py-3 md:py-4 px-3 md:px-4 text-left">
                      <span className="font-semibold text-gray-700 text-xs md:text-sm">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.map((task) => {
                    const canEdit = canEditTask(task);
                    const canDelete = canDeleteTask(task);
                    const isResponsible = isUserResponsible(task);
                    const isCreator = isTaskCreator(task);
                    const isAssignedAndNotOpened = task.status === 'assigned';
                    const statusCounts = getSubTaskStatusCounts(task.subTasks);
                    const isRowMatch = isHighlighted(task.id, task.task);
                    
                    return (
                      <React.Fragment key={task.id}>
                        <tr 
                          id={`task-row-${task.id}`}
                          className={`border-b border-gray-100 transition-colors cursor-pointer ${
                            isRowMatch
                              ? "bg-[#F0F0FF] ring-2 sm:ring-4 ring-[#7889F5] shadow-md font-semibold"
                              : expandedTaskId === task.id
                              ? "bg-blue-50"
                              : "hover:bg-gray-50"
                          } ${isResponsible ? "border-l-4 border-l-purple-500" : ""} ${
                            isCreator ? "border-r-4 border-r-green-500" : ""
                          }`} 
                          onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        >
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div className="flex items-center">
                              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-[#7889F5] to-[#A5AEFF] flex items-center justify-center text-white font-semibold mr-2 md:mr-3 text-xs md:text-sm">
                                {getInitials(task.employeeName)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium text-gray-900 text-sm md:text-base truncate block max-w-[120px] md:max-w-none">
                                  {task.employeeName}
                                </span>
                                {task.assignedByName && (
                                  <p className="text-xs text-gray-500 truncate hidden md:block">by: {task.assignedByName}</p>
                                )}
                                {isCreator && <span className="text-xs text-green-600 font-medium">Created by you</span>}
                                {isResponsible && !isCreator && <span className="text-xs text-purple-600 font-medium">You're responsible</span>}
                              </div>
                            </div>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <p className="text-gray-800 line-clamp-2 max-w-[200px] md:max-w-md capitalize text-sm md:text-base font-medium">
                                  {task.task}
                                </p>
                                {isRowMatch && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#7889F5] text-white shadow-2xs animate-pulse">
                                    🎯 Match
                                  </span>
                                )}
                              </div>
                              {task.subTasks && task.subTasks.length > 0 && (
                                <div className="text-xs space-y-1">
                                  <div className="flex flex-wrap gap-2">
                                    {statusCounts.completed > 0 && (
                                      <span className="inline-flex items-center gap-1 text-green-600">
                                        <CheckCircle className="w-3 h-3" />
                                        {statusCounts.completed} completed
                                      </span>
                                    )}
                                    {statusCounts.closed > 0 && (
                                      <span className="inline-flex items-center gap-1 text-gray-600">
                                        <CircleX className="w-3 h-3" />
                                        {statusCounts.closed} closed
                                      </span>
                                    )}
                                    {statusCounts.inprogress > 0 && (
                                      <span className="inline-flex items-center gap-1 text-blue-600">
                                        <Clock className="w-3 h-3" />
                                        {statusCounts.inprogress} in progress
                                      </span>
                                    )}
                                    {statusCounts.delayed > 0 && (
                                      <span className="inline-flex items-center gap-1 text-red-600">
                                        <AlertCircle className="w-3 h-3" />
                                        {statusCounts.delayed} delayed
                                      </span>
                                    )}
                                    {statusCounts.pending > 0 && (
                                      <span className="inline-flex items-center gap-1 text-gray-500">
                                        <Circle className="w-3 h-3" />
                                        {statusCounts.pending} pending
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-500">
                                    Total: {statusCounts.completed + statusCounts.closed}/{statusCounts.total} completed/closed
                                  </div>
                                </div>
                              )}
                            </div>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div className="space-y-2">
                              {renderStatusBadge(task.status)}
                              {task.subTasks && task.subTasks.length > 0 && (
                                <div className="text-xs">
                                  {renderSubTaskStatusBreakdown(task.subTasks)}
                                </div>
                              )}
                            </div>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div className="space-y-2">
                              {task.priority && renderPriorityBadge(task.priority)}
                              {task.subTasks && task.subTasks.length > 0 && (
                                <div className="text-xs">
                                  {renderSubTaskPriorityBreakdown(task.subTasks)}
                                </div>
                              )}
                            </div>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                              {task.category || 'Uncategorized'}
                            </span>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div className="flex items-center text-gray-700 text-xs md:text-sm">
                              <Calendar className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2 flex-shrink-0" />
                              <span className="whitespace-nowrap">{formatDate(task.deadline)}</span>
                            </div>
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            {task.overallProgress !== undefined && (
                              <div className="w-full">
                                <div className="flex justify-between text-xs text-gray-600 mb-1">
                                  <span>{Math.round(task.overallProgress)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div 
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                      task.overallProgress === 100 ? 'bg-green-600' :
                                      task.overallProgress >= 70 ? 'bg-blue-600' :
                                      task.overallProgress >= 30 ? 'bg-yellow-600' :
                                      'bg-red-600'
                                    }`}
                                    style={{ width: `${task.overallProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                           </td>
                          <td className="py-3 md:py-4 px-3 md:px-4">
                            <div className="flex items-center space-x-1 md:space-x-2">
                              <button 
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  await handleViewTask(task);
                                }} 
                                className={`p-1.5 md:p-2 rounded-lg transition-colors ${isAssignedAndNotOpened ? 'text-orange-600 hover:bg-orange-50 animate-pulse' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'}`} 
                                title={isAssignedAndNotOpened ? 'Click to open and start task' : 'View Details'}
                              >
                                <Eye className="w-3 h-3 md:w-4 md:h-4" />
                              </button>
                              {(canEdit || canDelete) && (
                                <div className="flex space-x-1">
                                  {canEdit && (
                                    <button onClick={(e) => { e.stopPropagation(); handleEditTask(task); }} className="p-1.5 md:p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                      <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button onClick={(e) => { e.stopPropagation(); setTaskToDelete(task.id); setIsDeleteConfirmOpen(true); }} className="p-1.5 md:p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                      <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                              <button className="p-1.5 md:p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                                {expandedTaskId === task.id ? <ChevronUp className="w-3 h-3 md:w-4 md:h-4" /> : <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />}
                              </button>
                            </div>
                           </td>
                         </tr>
                        {expandedTaskId === task.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-4 md:px-6 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <h4 className="font-semibold text-gray-900 mb-3">Task Details</h4>
                                  <div className="space-y-3">
                                    <div className="flex items-center text-gray-600">
                                      <User className="w-4 h-4 mr-2" />
                                      <span>Created by: <span className="font-semibold ml-1">{task.createdByName || task.assignedByName}</span></span>
                                    </div>
                                    <div className="flex items-center text-gray-600">
                                      <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                                      <span>Main Deadline: <span className="font-semibold ml-1">{formatDate(task.deadline)}</span></span>
                                    </div>
                                    <div className="flex items-center text-gray-600">
                                      <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                                      <span>Created: <span className="font-semibold ml-1">{formatDateTime(task.createdAt)}</span></span>
                                    </div>
                                    <div className="flex items-center text-gray-600">
                                      <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                                      <span>Updated: <span className="font-semibold ml-1">{formatDateTime(task.updatedAt)}</span></span>
                                    </div>
                                    {task.openedAt && (
                                      <div className="flex items-center text-gray-600">
                                        <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                                        <span>First Opened: <span className="font-semibold ml-1">{formatDateTime(task.openedAt)}</span></span>
                                      </div>
                                    )}
                                    {task.additionalNotes && (
                                      <div className="mt-4">
                                        <h4 className="font-semibold text-gray-900 mb-2">Additional Notes</h4>
                                        <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg">{task.additionalNotes}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="flex items-center mb-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#7889F5] to-[#A5AEFF] flex items-center justify-center text-white font-semibold mr-3 flex-shrink-0">
                                      {getInitials(task.employeeName)}
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-gray-900">{task.employeeName}</h4>
                                      <p className="text-sm text-gray-600">Assigned Employee</p>
                                    </div>
                                  </div>
                                  {task.overallProgress !== undefined && renderProgressBar(task.overallProgress)}
                                </div>
                              </div>
                              {renderSubTasks(task, false)}
                             </td>
                           </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredTasks.length}
              itemsPerPage={itemsPerPage}
              pageSizeOptions={[5, 10, 20, 50]}
              onPageSizeChange={setItemsPerPage}
              itemLabel="tasks"
              className="border-t border-[#E1E5F0]"
            />
          </>
          ) : (
            <EmptyState
              icon={<Calendar className="w-7 h-7 text-[#7889F5]" />}
              title="No tasks found"
              description={
                searchTerm || filterStatus !== 'all' || filterPriority !== 'all' 
                  ? 'Try changing your search or filter criteria' 
                  : canAssignTask() 
                    ? 'Start by creating a new task' 
                    : 'No tasks have been assigned to you yet'
              }
              action={
                canAssignTask() && !searchTerm && filterStatus === 'all' && filterPriority === 'all'
                  ? {
                      label: user.role === 'staff' ? 'Create Your First Task' : 'Assign The First Task',
                      onClick: () => setIsAddModalOpen(true),
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {isAddModalOpen && renderAddTaskModal()}
      {isEditModalOpen && renderEditTaskModal()}
      {isDeleteConfirmOpen && renderDeleteConfirmModal()}
      {isViewModalOpen && renderViewModal()}
    </div>
  );
};

export default TaskManagement;