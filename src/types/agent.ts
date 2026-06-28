/**
 * Agent types — for the AI orchestrator and tool calls
 */

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "function";
  content: string;
  timestamp: string;
  actions?: AgentAction[];
  toolResults?: ToolResult[];
}

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
  result?: ToolResult;
  status: "pending" | "running" | "success" | "failed";
  error?: string;
  /** Tool-call id from the model, used to align results in synthesize mode. */
  callId?: string;
}

export interface ToolResult {
  success: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

export interface AgentContext {
  user: {
    uid: string;
    name: string;
    energyPattern: string;
    workHours: { start: string; end: string };
  };
  tasks: {
    active: number;
    overdue: number;
    upcomingToday: number;
    highRisk: number;
  };
  calendar: {
    busyHoursToday: number;
    freeHoursToday: number;
    nextFreeSlot?: string;
    eventsToday?: number;
    eventsTotal?: number;
  };
  recentActivity: string[];
  /** Live task list — lets the model answer questions about specific items. */
  taskList?: import("./task").Task[];
  /** Live events for today. */
  eventList?: import("./task").CalendarEvent[];
  /** Live goals. */
  goalList?: import("./task").Goal[];
  /** Live habits. */
  habitList?: import("./task").Habit[];
  /** Live inbox drafts. */
  draftList?: import("./task").DraftDocument[];
  /** AI memory — current project, stack, preferences. */
  userContext?: import("./schema").UserContextSchema;
}

/**
 * Agent function-calling tool declarations (OpenAI/MiniMax `tools` format).
 */
import type { RiskLevel } from "./task";

export interface AgentTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface PanicScore {
  taskId: string;
  score: number; // 0-100
  level: RiskLevel;
  factors: {
    timePressure: number; // 0-40
    progressGap: number; // 0-30
    dependencyBlock: number; // 0-15
    userEnergy: number; // 0-15
  };
  recommendation: string;
}
