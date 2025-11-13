const { createLogger, format, transports } = require('winston');
const LokiTransport = require('winston-loki');
const config = require('./config');

// --- 1. Load Version ---
let appVersion = 'unknown';
try {
  const versionData = require('./version.json');
  appVersion = versionData.version;
} catch {
  console.warn(
    'Could not load ./version.json. Service version will be "unknown".',
  );
}

// --- 2. Sanitization (Requirement #5) ---

// Define all sensitive keys that should be redacted from logs
const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'email',
];

/**
 * Recursively scrubs sensitive keys from a log object.
 * This is crucial for Requirement #5 and for logging request bodies.
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // Handle arrays by sanitizing each element
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  // Use reduce to build a new, sanitized object
  return Object.keys(obj).reduce((acc, key) => {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      acc[key] = '[REDACTED]';
    } else {
      acc[key] = sanitizeObject(obj[key]);
    }
    return acc;
  }, {});
}

// Create a custom winston format that uses sanitizer
const sanitizer = format((info) => {
  // `info.metadata` is where express-winston often stores its data.
  // Sanitize both the root object and the metadata object.
  const sanitizedInfo = sanitizeObject({ ...info });
  if (info.metadata) {
    sanitizedInfo.metadata = sanitizeObject({ ...info.metadata });
  }
  return sanitizedInfo;
});

// --- 3. Transports ---

// Define the labels to be added to every log.
const lokiLabels = {
  job: 'jwt-pizza-service',
  service_name: config.logging.source || 'jwt-pizza-service-unknown',
  service_version: appVersion,
};

// Define the Loki transport.
const lokiTransport = new LokiTransport({
  host: config.logging.url,
  basicAuth: `${config.logging.userId}:${config.logging.apiKey}`,
  labels: lokiLabels,
  format: format.json(),
  // Set a batching interval
  interval: 5,
});

// Create our list of transports.
const myTransports = [
  // We always send to Loki
  lokiTransport,
];

// *** AWS cost concern ***
// if (process.env.NODE_ENV !== 'production') {
//   myTransports.push(
//     new transports.Console({
//       format: format.combine(
//         format.colorize(),
//         format.simple(),
//       ),
//     }),
//   );
//   console.log('Development mode: Logging to console AND Loki.');
// } else {
//   console.log('Production mode: Logging to Loki.');
// }

// --- 4. Exception Handling (Requirement #4) ---

// Unncaught exceptions.
const myExceptionHandlers = [
  lokiTransport
];
// if (process.env.NODE_ENV !== 'production') {
//   myExceptionHandlers.push(new transports.Console());
// }


// --- 5. Create the Logger ---

const logger = createLogger({
  // The default log level.
  level: process.env.LOG_LEVEL || 'debug',
  
  // Combine sanitizer with the final JSON formatter.
  format: format.combine(
    format.timestamp(),
    sanitizer(),
    format.json()
  ),
  
  // Use the transports defined above
  transports: myTransports,
  
  // Use the exception handlers defined above
  exceptionHandlers: myExceptionHandlers,
  
  // Do not exit the process on an unhandled exception
  exitOnError: false,
});

module.exports = logger;