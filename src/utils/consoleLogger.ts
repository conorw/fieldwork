/**
 * Console Logger Utility
 * Captures console logs for display in the UI
 */

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  args: any[];
  errorDetails?: {
    name?: string;
    message?: string;
    stack?: string;
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
    cause?: any;
  };
}

class ConsoleLogger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    // Override console methods
    this.setupConsoleCapture();
  }

  private setupConsoleCapture() {
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      this.addLog("log", args);
    };

    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      this.addLog("info", args);
    };

    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      this.addLog("warn", args);
    };

    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      this.addLog("error", args);
    };

    console.debug = (...args: any[]) => {
      this.originalConsole.debug(...args);
      this.addLog("debug", args);
    };
  }

  private addLog(level: LogEntry["level"], args: any[]) {
    // Extract error details if present
    let errorDetails: LogEntry["errorDetails"] | undefined;
    const errorArg = args.find((arg) => arg instanceof Error);

    if (errorArg instanceof Error) {
      errorDetails = {
        name: errorArg.name,
        message: errorArg.message,
        stack: errorArg.stack,
        cause: (errorArg as any).cause,
      };

      // Try to extract file/line info from stack trace
      if (errorArg.stack) {
        const stackLines = errorArg.stack.split("\n");
        if (stackLines.length > 1) {
          // Parse first stack frame: "at functionName (file:///path/to/file.js:123:45)"
          const match = stackLines[1].match(/\((.+):(\d+):(\d+)\)/);
          if (match) {
            errorDetails.fileName = match[1];
            errorDetails.lineNumber = parseInt(match[2], 10);
            errorDetails.columnNumber = parseInt(match[3], 10);
          }
        }
      }
    }

    const message = args
      .map((arg) => {
        if (arg instanceof Error) {
          // For errors, include name and message
          return `${arg.name}: ${arg.message}`;
        }
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      level,
      message,
      args,
      errorDetails,
    };

    this.logs.push(entry);

    // Limit log size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener([...this.logs]));
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.listeners.forEach((listener) => listener([...this.logs]));
  }

  subscribe(callback: (logs: LogEntry[]) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  setMaxLogs(max: number) {
    this.maxLogs = max;
    // Trim if necessary
    if (this.logs.length > max) {
      this.logs = this.logs.slice(-max);
      this.listeners.forEach((listener) => listener([...this.logs]));
    }
  }
}

// Singleton instance
export const consoleLogger = new ConsoleLogger();
