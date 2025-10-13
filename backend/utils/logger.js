/**
 * Simple logger utility with formatted timestamps
 */

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
};

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, message, data = null) {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}]`;

  if (data) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

const logger = {
  info: (message, data) => log(LOG_LEVELS.INFO, message, data),
  warn: (message, data) => log(LOG_LEVELS.WARN, message, data),
  error: (message, data) => log(LOG_LEVELS.ERROR, message, data),
  success: (message, data) => log(LOG_LEVELS.SUCCESS, message, data)
};

module.exports = logger;
