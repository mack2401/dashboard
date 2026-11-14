// TaskDashboard.tsx - Fixed Version
import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import { Calendar, CheckCircle, Clock, AlertCircle, Users, TrendingUp, ListTodo, Award, ChevronRight, Target, Zap, Activity, TrendingDown } from 'lucide-react';
import { db } from "../firebase";
import { collection, query, onSnapshot, Timestamp } from 'firebase/firestore';

// Helper function to safely convert any date to Date object
const toDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Timestamp) return date.toDate();
  if (date instanceof Date) return date;
  if (typeof date === 'string') return new Date(date);
  if (typeof date === 'number') return new Date(date);
  if (date.toDate && typeof date.toDate === 'function') return date.toDate();
  return new Date(date);
};

// Helper function to format date for grouping
const formatDateForGroup = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Helper function to get week number
const getWeekNumber = (date: Date): number => {
  const startDate = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startDate.getDay() + 1) / 7);
};

interface Task {
  id: string;
  staffId: string;
  employeeName: string;
  status: string;
  deadline: any;
  task: string;
  createdAt: any;
  updatedAt: any;
  assignedBy?: string;
  assignedByName?: string;
  category?: string;
  priority?: string;
  overallProgress?: number;
}

interface TaskDashboardProps {
  tasks?: Task[];
}

const TaskDashboard: React.FC<TaskDashboardProps> = ({ tasks: propTasks }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('week');

  useEffect(() => {
    if (propTasks) {
      setTasks(propTasks);
      setLoading(false);
      return;
    }

    const tasksQuery = query(collection(db, 'tasks'));
    
    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const tasksData: Task[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Task));
      setTasks(tasksData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching tasks:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [propTasks]);

  // Calculate statistics using safe date conversion
  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'inprogress').length;
    const delayed = tasks.filter(t => t.status === 'delayed').length;
    const assigned = tasks.filter(t => t.status === 'assigned').length;
    const opened = tasks.filter(t => t.status === 'opened').length;
    const closed = tasks.filter(t => t.status === 'closed').length;
    
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    return { total, completed, inProgress, delayed, assigned, opened, closed, completionRate };
  };

  // Get tasks by priority
  const getTasksByPriority = () => {
    const critical = tasks.filter(t => t.priority === 'critical').length;
    const high = tasks.filter(t => t.priority === 'high').length;
    const medium = tasks.filter(t => t.priority === 'medium').length;
    const low = tasks.filter(t => t.priority === 'low').length;
    
    return [
      { name: 'Critical', value: critical, color: '#ef4444' },
      { name: 'High', value: high, color: '#f97316' },
      { name: 'Medium', value: medium, color: '#eab308' },
      { name: 'Low', value: low, color: '#22c55e' },
    ].filter(p => p.value > 0);
  };

  // Get tasks by category
  const getTasksByCategory = () => {
    const categoryMap = new Map<string, number>();
    tasks.forEach(task => {
      if (task.category) {
        categoryMap.set(task.category, (categoryMap.get(task.category) || 0) + 1);
      }
    });
    
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];
    return Array.from(categoryMap.entries()).map(([name, value], index) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: colors[index % colors.length]
    }));
  };

  // Get completion trend over time using safe date conversion
  const getCompletionTrend = () => {
    const now = new Date();
    let startDate: Date;
    
    if (selectedPeriod === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (selectedPeriod === 'month') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    } else {
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
    }
    
    const filteredTasks = tasks.filter(task => {
      const createdAt = toDate(task.createdAt);
      return createdAt >= startDate;
    });
    
    const groupedData = new Map<string, { completed: number; total: number }>();
    
    filteredTasks.forEach(task => {
      const createdAt = toDate(task.createdAt);
      let key: string;
      
      if (selectedPeriod === 'week') {
        key = formatDateForGroup(createdAt);
      } else if (selectedPeriod === 'month') {
        key = `Week ${getWeekNumber(createdAt)}`;
      } else {
        key = createdAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
      
      if (!groupedData.has(key)) {
        groupedData.set(key, { completed: 0, total: 0 });
      }
      
      const data = groupedData.get(key)!;
      data.total += 1;
      if (task.status === 'completed') {
        data.completed += 1;
      }
    });
    
    return Array.from(groupedData.entries()).map(([period, data]) => ({
      period,
      completed: data.completed,
      total: data.total,
      rate: data.total > 0 ? (data.completed / data.total) * 100 : 0
    }));
  };

  // Get performance by employee using safe date conversion
  const getEmployeePerformance = () => {
    const employeeMap = new Map<string, { name: string; total: number; completed: number; delayed: number; inProgress: number }>();
    
    tasks.forEach(task => {
      if (!employeeMap.has(task.staffId)) {
        employeeMap.set(task.staffId, {
          name: task.employeeName,
          total: 0,
          completed: 0,
          delayed: 0,
          inProgress: 0
        });
      }
      
      const data = employeeMap.get(task.staffId)!;
      data.total += 1;
      if (task.status === 'completed') data.completed += 1;
      if (task.status === 'delayed') data.delayed += 1;
      if (task.status === 'inprogress') data.inProgress += 1;
    });
    
    return Array.from(employeeMap.values())
      .map(emp => ({
        ...emp,
        completionRate: emp.total > 0 ? (emp.completed / emp.total) * 100 : 0
      }))
      .sort((a, b) => b.completionRate - a.completionRate)
      .slice(0, 5);
  };

  // Get upcoming deadlines using safe date conversion
  const getUpcomingDeadlines = () => {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(now.getDate() + 7);
    
    const pendingTasks = tasks.filter(task => 
      task.status !== 'completed' && task.status !== 'closed'
    );
    
    const getDeadlineDate = (deadline: any): Date => toDate(deadline);
    
    return pendingTasks
      .map(task => ({
        ...task,
        deadlineDate: getDeadlineDate(task.deadline)
      }))
      .filter(task => task.deadlineDate >= now && task.deadlineDate <= sevenDaysLater)
      .sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime())
      .slice(0, 5);
  };

  const stats = getTaskStats();
  const priorityData = getTasksByPriority();
  const categoryData = getTasksByCategory();
  const trendData = getCompletionTrend();
  const employeePerformance = getEmployeePerformance();
  const upcomingDeadlines = getUpcomingDeadlines();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <ListTodo className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Total Tasks</p>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <CheckCircle className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.completed}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Completed</p>
        </div>
        
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <Clock className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.inProgress}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">In Progress</p>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <AlertCircle className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.delayed}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Delayed</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.assigned}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Assigned</p>
        </div>
        
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <Activity className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{stats.opened}</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Opened</p>
        </div>
        
        <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <Target className="w-8 h-8 opacity-80" />
            <span className="text-2xl font-bold">{Math.round(stats.completionRate)}%</span>
          </div>
          <p className="text-sm opacity-90 mt-2">Completion Rate</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Trend Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Task Completion Trend</h3>
              <p className="text-sm text-gray-500">Overview of task completion over time</p>
            </div>
            <div className="flex gap-2">
              {(['week', 'month', 'year'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    selectedPeriod === period
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Completed Tasks"
                dot={{ fill: '#3b82f6', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#9ca3af"
                strokeWidth={2}
                name="Total Tasks"
                dot={{ fill: '#9ca3af', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Tasks by Priority</h3>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {priorityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No priority data available
            </div>
          )}
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Tasks by Category</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px'
                  }}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No category data available
            </div>
          )}
        </div>

        {/* Employee Performance */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Performers</h3>
          {employeePerformance.length > 0 ? (
            <div className="space-y-4">
              {employeePerformance.map((employee, index) => (
                <div key={employee.name} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-gray-900">{employee.name}</span>
                      <span className="text-sm text-gray-600">{Math.round(employee.completionRate)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${employee.completionRate}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-500">
                      <span>{employee.completed}/{employee.total} completed</span>
                      {employee.delayed > 0 && <span className="text-red-500">{employee.delayed} delayed</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-green-600">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm font-medium">Rank #{index + 1}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No employee performance data available
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Deadlines</h3>
            <p className="text-sm text-gray-500">Tasks due in the next 7 days</p>
          </div>
          <Calendar className="w-6 h-6 text-gray-400" />
        </div>
        
        {upcomingDeadlines.length > 0 ? (
          <div className="space-y-3">
            {upcomingDeadlines.map((task) => {
              const daysLeft = Math.ceil((task.deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysLeft <= 2;
              
              return (
                <div key={task.id} className={`flex items-center justify-between p-4 rounded-xl border ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{task.task}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-gray-600">Assigned to: {task.employeeName}</span>
                      {task.category && (
                        <span className="text-xs px-2 py-1 bg-gray-200 rounded-full">{task.category}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${isUrgent ? 'text-red-600' : 'text-orange-600'}`}>
                      {daysLeft} days left
                    </p>
                    <p className="text-xs text-gray-500">{formatDateForGroup(task.deadlineDate)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-600">No upcoming deadlines! Great job staying on top of tasks.</p>
          </div>
        )}
      </div>

      {/* AI Insight Summary */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-8 h-8" />
          <h3 className="text-xl font-semibold">AI Insight Summary</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-sm opacity-90">Overall Completion Rate</p>
            <p className="text-2xl font-bold mt-1">{Math.round(stats.completionRate)}%</p>
            {stats.completionRate >= 70 ? (
              <p className="text-xs mt-2 opacity-80">Excellent progress! Keep up the momentum.</p>
            ) : stats.completionRate >= 40 ? (
              <p className="text-xs mt-2 opacity-80">Good progress, but there's room for improvement.</p>
            ) : (
              <p className="text-xs mt-2 opacity-80">Focus on completing pending tasks to improve your rate.</p>
            )}
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-sm opacity-90">Priority Focus</p>
            <p className="text-2xl font-bold mt-1">
              {priorityData.find(p => p.name === 'Critical')?.value || 0} Critical
            </p>
            {priorityData.find(p => p.name === 'Critical')?.value > 0 ? (
              <p className="text-xs mt-2 opacity-80">Focus on critical tasks first to prevent delays.</p>
            ) : (
              <p className="text-xs mt-2 opacity-80">No critical tasks. Maintain this balance!</p>
            )}
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-sm opacity-90">Upcoming Workload</p>
            <p className="text-2xl font-bold mt-1">{upcomingDeadlines.length} Tasks</p>
            {upcomingDeadlines.length > 5 ? (
              <p className="text-xs mt-2 opacity-80">Heavy workload ahead. Plan your schedule carefully.</p>
            ) : upcomingDeadlines.length > 0 ? (
              <p className="text-xs mt-2 opacity-80">Manageable workload. Stay on track!</p>
            ) : (
              <p className="text-xs mt-2 opacity-80">Light schedule. Great time to tackle backlog.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDashboard;