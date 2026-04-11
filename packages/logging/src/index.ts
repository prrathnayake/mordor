export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  getRecentLogs?(limit?: number, levels?: string[]): LogEntry[];
}

class LogStore {
  private logs: LogEntry[] = [];
  private maxSize: number = 1000;

  add(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  getRecent(limit: number = 100, levels?: string[]): LogEntry[] {
    let filtered = this.logs;
    if (levels && levels.length > 0) {
      filtered = this.logs.filter((log) => levels.includes(log.level));
    }
    return filtered.slice(-limit);
  }
}

const globalLogStore = new LogStore();

class StructuredLogger implements Logger {
  private level: LogLevel;
  private context: string;

  constructor(context: string, level: LogLevel = "info") {
    this.context = context;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata,
    };

    globalLogStore.add(entry);
    console.log(JSON.stringify(entry));
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  getRecentLogs(limit: number = 100, levels?: string[]): LogEntry[] {
    return globalLogStore.getRecent(limit, levels);
  }
}

export function createLogger(context: string, level?: LogLevel): Logger {
  return new StructuredLogger(context, level ?? "info");
}

export const defaultLogger = createLogger("app");
