export enum UserRole {
  Manager = 'Manager',
  Employee = 'Employee',
}

export enum TaskStatus {
  ToDo = 'ToDo',
  InProgress = 'InProgress',
  InReview = 'InReview',
  Done = 'Done',
}

export enum TaskPriority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  teamId: string;
  createdAt: string;
}

export interface Team {
  teamId: string;
  name: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  title: string;
  description: string;
  managerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId: string;
  imageKey?: string;
  resizedImageKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  taskId: string;
  commentId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface AuditLogEntry {
  taskId: string;
  timestamp: string;
  event: string;
  actorId: string;
  targetId?: string;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  teamId: string;
}

export interface CognitoUser {
  userId: string;
  email: string;
  role: UserRole;
  teamId?: string;
  displayName: string;
}
