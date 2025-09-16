type LogLevel =
  | 'info'
  | 'warn'
  | 'error'
  | 'debug'
  | 'success'
  | 'trace'
  | 'log';
type LogMessage = string | number | boolean | object | null | undefined;

interface LogOptions {
  timestamp?: boolean;
  prefix?: string;
  showLevel?: boolean;
  tags?: string[];
}

export const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
} as const;

const defaultOptions: LogOptions = {
  timestamp: true,
  showLevel: true,
  tags: [],
};

const getTimestamp = (): string => {
  return new Date().toLocaleTimeString();
};

const colorize = (text: string, color: keyof typeof COLORS): string => {
  return `${COLORS[color]}${text}${COLORS.reset}`;
};

const formatMessage = (
  level: LogLevel,
  message: LogMessage,
  options: LogOptions = {},
): string => {
  const opts = { ...defaultOptions, ...options };
  const parts: string[] = [];

  if (opts.timestamp) {
    parts.push(colorize(`[${getTimestamp()}]`, 'gray'));
  }

  if (opts.showLevel) {
    const levelColors: Record<LogLevel, keyof typeof COLORS> = {
      info: 'blue',
      warn: 'yellow',
      error: 'red',
      debug: 'magenta',
      success: 'green',
      trace: 'gray',
      log: 'white',
    };

    parts.push(colorize(`[${level.toUpperCase()}]`, levelColors[level]));
  }

  if (opts.prefix) {
    parts.push(colorize(`[${opts.prefix}]`, 'cyan'));
  }

  if (opts.tags && opts.tags.length > 0) {
    const tagString = opts.tags.map((tag) => `#${tag}`).join(' ');
    parts.push(colorize(tagString, 'cyan'));
  }

  const formattedMessage =
    typeof message === 'object'
      ? JSON.stringify(message, null, 2)
      : String(message);

  parts.push(formattedMessage);
  return parts.join(' ');
};

export const info = (message: LogMessage, options?: LogOptions): void => {
  console.info(formatMessage('info', message, options));
};

export const warn = (message: LogMessage, options?: LogOptions): void => {
  console.warn(formatMessage('warn', message, options));
};

export const error = (message: LogMessage, options?: LogOptions): void => {
  console.error(formatMessage('error', message, options));
};

export const debug = (message: LogMessage, options?: LogOptions): void => {
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.search.includes('debug=true'))
  ) {
    console.debug(formatMessage('debug', message, options));
  }
};

export const success = (message: LogMessage, options?: LogOptions): void => {
  console.info(formatMessage('success', message, options));
};

export const log = (message: LogMessage, options?: LogOptions): void => {
  console.info(formatMessage('log', message, options));
};

export const trace = (message: LogMessage, options?: LogOptions): void => {
  console.trace(formatMessage('trace', message, options));
};

export const table = (
  data: Record<string, unknown>[],
  title?: string,
): void => {
  if (title) {
    console.info(colorize(`[TABLE: ${title}]`, 'cyan'));
  }
  console.table(data);
};

export const group = (label: string, fn: () => void): void => {
  console.group(colorize(label, 'cyan'));
  try {
    fn();
  } catch (err) {
    error(
      `Error in group "${label}": ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    console.groupEnd();
  }
};

export const time = async <T>(
  label: string,
  fn: () => Promise<T> | T,
): Promise<T> => {
  console.time(colorize(`⏱ ${label}`, 'cyan'));
  try {
    const result = await fn();
    console.timeEnd(colorize(`⏱ ${label}`, 'cyan'));
    return result;
  } catch (err) {
    console.timeEnd(colorize(`⏱ ${label}`, 'cyan'));
    error(
      `Error in timed operation "${label}": ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
};

export const count = (label: string): void => {
  console.count(colorize(label, 'cyan'));
};

export const countReset = (label: string): void => {
  console.countReset(colorize(label, 'cyan'));
};

export const divider = (
  char = '─',
  color: keyof typeof COLORS = 'gray',
): void => {
  const width = typeof window !== 'undefined' ? window.innerWidth : 80;
  console.info(colorize(char.repeat(width), color));
};
