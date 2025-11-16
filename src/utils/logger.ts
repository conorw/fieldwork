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
export const mapLogger = createLogger('MapEdit', LogLevel.DEBUG)
export const powerSyncLogger = createLogger('PowerSync', LogLevel.DEBUG)
export const mapViewLogger = createLogger('MapView', LogLevel.DEBUG)
export const mapComponentLogger = createLogger('MapComponent', LogLevel.DEBUG)
export const wizardLogger = createLogger('PlotCreationWizard', LogLevel.DEBUG)
export const locationLogger = createLogger('LocationIndicator', LogLevel.DEBUG)
export const analysisLogger = createLogger('HeadstoneAnalysis', LogLevel.DEBUG)
export const cameraLogger = createLogger('CapacitorCamera', LogLevel.DEBUG)
export const storeLogger = createLogger('Store', LogLevel.DEBUG)
