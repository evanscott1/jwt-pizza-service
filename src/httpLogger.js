const expressWinston = require('express-winston');
const logger = require('./logger');
const { format } = require('winston');

// Create HTTP logger
const httpLogger = expressWinston.logger({
  transports: logger.transports,
  format: format.combine(
    format.colorize(),
    format.json()
  ),
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
  colorize: true,
});

module.exports = httpLogger;