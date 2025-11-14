const { createLogger, transports, format } = require('winston');
const LokiTransport = require('winston-loki');
const config = require('./config');
const appVersion = require('./version.json').version || 'unknown';

const logLevel = 'debug';
console.log(`[DEBUG] Logger level set to: ${logLevel}`);

const lokiLabels = {
  job: 'jwt-pizza-service',
  service_name: config.serviceName || 'jwt-pizza-service-dev',
  service_version: appVersion,
};

// --- Create Transports ---
const myTransports = [
  // Transport 1: The Console
  new transports.Console({
    format: format.simple(),
  }),
];

try {
  // Transport 2: Loki
  const lokiTransport = new LokiTransport({
    host: config.logging.url,
    basicAuth: `${config.logging.apiKey}`,
    labels: lokiLabels,
    json: true,
    format: format.json(),
    interval: 5,
  });
  
  lokiTransport.on('error', (err) => {
    console.error('[DEBUG] Loki Transport Failed:', err);
  });
  
  myTransports.push(lokiTransport);
  console.log('[DEBUG] LokiTransport created successfully.');
  
} catch (error) {
  console.error('[DEBUG] FAILED to create Loki transport:', error.message);
}

// --- Create the Logger ---
const logger = createLogger({
  level: logLevel, // Use our hardcoded level
  transports: myTransports,
  exitOnError: false,
});

console.log('[DEBUG] Minimal logger.js initialization complete.');
module.exports = logger;