import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  info,
  warn,
  error,
  debug,
  success,
  trace,
  table,
  group,
  time,
  count,
  countReset,
  divider,
  COLORS,
} from './logger';

// Mock console methods
const mockConsole = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  table: vi.fn(),
  group: vi.fn(),
  groupEnd: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
  count: vi.fn(),
  countReset: vi.fn(),
};

// Mock window object for Node.js environment
const mockWindow = {
  location: {
    hostname: 'localhost',
    search: '',
  },
  innerWidth: 80,
};

describe('Logger Utility', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Mock console methods
    global.console = mockConsole as any;
    // Mock window object
    global.window = mockWindow as any;
  });

  describe('Basic Logging Functions', () => {
    it('should log info messages with proper formatting', () => {
      info('Test info message');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test info message'),
      );
    });

    it('should log warn messages with proper formatting', () => {
      warn('Test warn message');
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
      );
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Test warn message'),
      );
    });

    it('should log error messages with proper formatting', () => {
      error('Test error message');
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error message'),
      );
    });

    it('should log debug messages with proper formatting', () => {
      debug('Test debug message');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
      );
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message'),
      );
    });

    it('should log success messages with proper formatting', () => {
      success('Test success message');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[SUCCESS]'),
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test success message'),
      );
    });

    it('should log trace messages with proper formatting', () => {
      trace('Test trace message');
      expect(mockConsole.trace).toHaveBeenCalledWith(
        expect.stringContaining('[TRACE]'),
      );
      expect(mockConsole.trace).toHaveBeenCalledWith(
        expect.stringContaining('Test trace message'),
      );
    });
  });

  describe('Logging Options', () => {
    it('should handle custom prefixes', () => {
      info('Test message', { prefix: 'Custom' });
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[Custom]'),
      );
    });

    it('should handle custom tags', () => {
      info('Test message', { tags: ['tag1', 'tag2'] });
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('#tag1 #tag2'),
      );
    });

    it('should handle object messages', () => {
      const testObj = { key: 'value' };
      info(testObj);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(testObj, null, 2)),
      );
    });

    it('should handle null/undefined messages', () => {
      info(null);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('null'),
      );
      info(undefined);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('undefined'),
      );
    });
  });

  describe('Special Functions', () => {
    it('should handle table logging', () => {
      const testData = [{ id: 1, name: 'Test' }];
      table(testData, 'Test Table');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('[TABLE: Test Table]'),
      );
      expect(mockConsole.table).toHaveBeenCalledWith(testData);
    });

    it('should handle group logging', () => {
      const groupFn = vi.fn();
      group('Test Group', groupFn);
      expect(mockConsole.group).toHaveBeenCalledWith(
        expect.stringContaining('Test Group'),
      );
      expect(groupFn).toHaveBeenCalled();
      expect(mockConsole.groupEnd).toHaveBeenCalled();
    });

    it('should handle group errors gracefully', () => {
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      group('Test Group', errorFn);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in group'),
      );
      expect(mockConsole.groupEnd).toHaveBeenCalled();
    });

    it('should handle time logging', async () => {
      const timeFn = vi.fn().mockResolvedValue('result');
      await time('Test Time', timeFn);
      expect(mockConsole.time).toHaveBeenCalledWith(
        expect.stringContaining('⏱ Test Time'),
      );
      expect(mockConsole.timeEnd).toHaveBeenCalledWith(
        expect.stringContaining('⏱ Test Time'),
      );
      expect(timeFn).toHaveBeenCalled();
    });

    it('should handle time errors gracefully', async () => {
      const errorFn = vi.fn().mockRejectedValue(new Error('Test error'));
      await expect(time('Test Time', errorFn)).rejects.toThrow('Test error');
      expect(mockConsole.timeEnd).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in timed operation'),
      );
    });

    it('should handle count logging', () => {
      count('Test Count');
      expect(mockConsole.count).toHaveBeenCalledWith(
        expect.stringContaining('Test Count'),
      );
    });

    it('should handle count reset', () => {
      countReset('Test Count');
      expect(mockConsole.countReset).toHaveBeenCalledWith(
        expect.stringContaining('Test Count'),
      );
    });

    it('should handle divider logging', () => {
      divider();
      expect(mockConsole.info).toHaveBeenCalledWith(
        `${COLORS.gray}${'─'.repeat(mockWindow.innerWidth)}${COLORS.reset}`,
      );
    });

    it('should handle custom divider characters', () => {
      divider('=', 'blue');
      expect(mockConsole.info).toHaveBeenCalledWith(
        `${COLORS.blue}${'='.repeat(mockWindow.innerWidth)}${COLORS.reset}`,
      );
    });
  });

  describe('Debug Mode', () => {
    it('should only log debug messages in debug mode', () => {
      // Set debug mode
      global.window.location.hostname = 'localhost';
      global.window.location.search = '';

      debug('Test debug message');
      expect(mockConsole.debug).toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Change to non-debug mode
      global.window.location.hostname = 'example.com';
      global.window.location.search = '';

      debug('Test debug message');
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug=true in search params', () => {
      global.window.location.hostname = 'example.com';
      global.window.location.search = '?debug=true';

      debug('Test debug message');
      expect(mockConsole.debug).toHaveBeenCalled();
    });
  });
});
