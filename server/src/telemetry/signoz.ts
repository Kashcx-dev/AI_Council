import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, metrics } from '@opentelemetry/api';

const SIGNOZ_TRACE_URL = process.env.SIGNOZ_TRACE_URL || 'http://localhost:4318/v1/traces';
const SIGNOZ_METRIC_URL = process.env.SIGNOZ_METRIC_URL || 'http://localhost:4318/v1/metrics';

export function initTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'ai-council-server',
    }),
    traceExporter: new OTLPTraceExporter({
      url: SIGNOZ_TRACE_URL,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: SIGNOZ_METRIC_URL,
      }),
      exportIntervalMillis: 5000,
    }),
  });

  try {
    sdk.start();
    console.log(`[SigNoz Telemetry] Initialized OTLP HTTP targeting ${SIGNOZ_TRACE_URL}`);
  } catch (error) {
    console.error('[SigNoz Telemetry] Initialization failed:', error);
  }
}

export const tracer = trace.getTracer('ai-council-tracer');
export const meter = metrics.getMeter('ai-council-meter');

// Custom metrics
export const tokenCounter = meter.createCounter('ai_council_tokens_total', {
  description: 'Total tokens burned across Council debate agents',
});

export const consensusGauge = meter.createHistogram('ai_council_confidence_score', {
  description: 'Confidence score percentage of Council decisions',
});
