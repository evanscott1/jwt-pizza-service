const winston = require('winston');
const expressWinston = require('express-winston');
const logger = require('./logger');

// HTTP labels - OpenTelemetry.
// Logs and metrics will have the same labels, making them easy to correlate.
const otelLabels = {
  'http.method': '{{req.method}}',
  'http.url': '{{req.url}}',
  'http.route': '{{req.route.path}}',
  'http.status_code': '{{res.statusCode}}',
};

const httpLogger = expressWinston.logger({
  // 1. Use existing Loki logger instance
  winstonInstance: logger,
  
  // 2. Add extra metadata to the log
  meta: true,
  
  // 3. Create a clean log message
  msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  
  // 4. Automatically add OTel labels for easy searching in Grafana
  dynamicMeta: (req, res) => {
    return otelLabels;
  },
  
  // 5. Whitelist request properties to log
  // Sanitizer in logger.js will automatically redact these.
  requestWhitelist: ['body', 'headers.authorization'],
  
  // 6. Whitelist response properties to log
  responseWhitelist: ['statusCode'],
  
  // 7. Don't colorize JSON logs
  colorize: false,
});

// A note on Response Body:
// Logging response bodies is complex, very slow, and can leak sensitive
// user data. It's almost always a better practice to log the *request*
// and the *status code*, which is what this configuration does.
// The `res.body` is not included by default for these reasons.

module.exports = httpLogger;