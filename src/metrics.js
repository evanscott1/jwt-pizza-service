// monitoring.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, } = require('@opentelemetry/semantic-conventions');
const { HostMetrics } = require('@opentelemetry/host-metrics');
const config = require('./config');

let appVersion = 'unknown';
try {
  const versionData = require('./version.json');
  appVersion = versionData.version;
} catch (error) {
  console.warn(
    'Could not load ./src/version.json. Service version will be "unknown".',
  );
}


// 1. Configure the Metric Exporter
const metricExporter = new OTLPMetricExporter({
  url: config.metrics.url, 
  headers: {
    // This is your Grafana API Key
    Authorization: `Bearer ${config.metrics.apiKey}`, 
  },
});

// 2. Configure the Metric Reader
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 10000,
});

// 3. Initialize the NodeSDK
const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName || 'jwt-pizza-service-dev',
        [ATTR_SERVICE_VERSION]: appVersion,
    }),

  metricReader: metricReader,
  
  instrumentations: [getNodeAutoInstrumentations(),
    //new HostMetrics(),
],

  // We are not setting 'traceExporter' since our goal is just metrics.
  // Traces will be collected but just go to the console by default.
});


try {
  // 2. --- START THE SDK FIRST ---
  // This creates and registers the global MeterProvider
  sdk.start();
  console.log('OpenTelemetry SDK started successfully.');

  // 3. --- START HOSTMETRICS AFTER ---
  // This will now find the global MeterProvider created by the SDK.
  const hostMetrics = new HostMetrics({ name: 'host-metrics' });
  hostMetrics.start();
  console.log('Host metrics collection started.');

} catch (error) {
  console.error('Error starting OpenTelemetry SDK:', error);
}
// 5. Handle graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => console.log('Telemetry shut down.'));
});