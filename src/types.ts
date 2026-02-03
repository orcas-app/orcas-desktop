export interface Project {
  id: number;
  title: string;
  description?: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface NewProject {
  title: string;
  description?: string;
  color?: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'for_review' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
  scheduled_date?: string;
  notes_file_path?: string;
  created_at: string;
  updated_at: string;
}

export interface NewTask {
  project_id: number;
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'for_review' | 'done';
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
}

export interface SubTask {
  id: number;
  task_id: number;
  title: string;
  description?: string;
  completed: boolean;
  agent_id?: number;
  created_at: string;
  updated_at: string;
}

export interface NewSubTask {
  task_id: number;
  title: string;
  description?: string;
  agent_id?: number;
}

export interface TaskWithSubTasks extends Task {
  subtasks: SubTask[];
}

export interface ProjectWithTasks extends Project {
  tasks: TaskWithSubTasks[];
}

export interface Agent {
  id: number;
  name: string;
  model_name: string;
  agent_prompt: string;
  system_role?: string | null;
  created_at: string;
  updated_at: string;
}

// Content block types for Anthropic API
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

// Token usage tracking
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[]; // Support both simple and complex content
  timestamp: Date;
  streaming?: boolean;
  usage?: TokenUsage; // Track token usage for each message
}

export interface ChatSession {
  id: string;
  agent: Agent;
  messages: ChatMessage[];
  isActive: boolean;
}

// Model information from provider APIs
export interface ModelInfo {
  id: string;            // Full snapshot ID: "claude-sonnet-4-20250514"
  display_name: string;  // Friendly name: "claude-sonnet-4"
  display_label: string; // Human label: "Claude Sonnet 4"
}

// Calendar types for Today page
export interface Calendar {
  id: string;
  title: string;
  color: string;
  source: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  is_all_day: boolean;
  location?: string;
  notes?: string;
  url?: string;
  attendees: string[];
  calendar_id: string;
}

export type PermissionStatus = 'notdetermined' | 'restricted' | 'denied' | 'authorized';