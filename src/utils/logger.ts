/**
 * Shared logging utilities to reduce console.log duplication
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel = LogLevel.INFO
  private prefix: string = ''

  constructor(prefix: string = '', level: LogLevel = LogLevel.INFO) {
    this.prefix = prefix
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level
  }

  private formatMessage(_level: string, message: string, ...args: any[]): [string, ...any[]] {
    const timestamp = new Date().toISOString().substr(11, 12)
    const prefix = this.prefix ? `[${timestamp}] ${this.prefix}:` : `[${timestamp}]`
    return [`${prefix} ${message}`, ...args]
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(...this.formatMessage('DEBUG', message, ...args))
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(...this.formatMessage('INFO', message, ...args))
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(...this.formatMessage('WARN', message, ...args))
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(...this.formatMessage('ERROR', message, ...args))
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix
  }
}

// Create logger instances for different components
export const createLogger = (prefix: string, level: LogLevel = LogLevel.INFO): Logger => {
  return new Logger(prefix, level)
}

// Pre-configured loggers for common components
// Set to INFO level to reduce verbosity (change to DEBUG for detailed logging)
export const mapLogger = createLogger('MapEdit', LogLevel.INFO)
export const powerSyncLogger = createLogger('PowerSync', LogLevel.INFO)
export const mapViewLogger = createLogger('MapView', LogLevel.INFO)
export const mapComponentLogger = createLogger('MapComponent', LogLevel.INFO)
export const wizardLogger = createLogger('PlotCreationWizard', LogLevel.INFO)
export const locationLogger = createLogger('LocationIndicator', LogLevel.INFO)
export const analysisLogger = createLogger('HeadstoneAnalysis', LogLevel.INFO)
export const cameraLogger = createLogger('CapacitorCamera', LogLevel.INFO)
export const storeLogger = createLogger('Store', LogLevel.INFO)
