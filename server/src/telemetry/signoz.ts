import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, metrics } from '@opentelemetry/api';

const SIGNOZ_ENDPOINT = process.env.SIGNOZ_OTLP_ENDPOINT || 'http://localhost:4317';

export function initTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'ai-council-server',
    }),
    traceExporter: new OTLPTraceExporter({
      url: SIGNOZ_ENDPOINT,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: SIGNOZ_ENDPOINT,
      }),
      exportIntervalMillis: 5000,
    }),
  });

  try {
    sdk.start();
    console.log(`[SigNoz Telemetry] Initialized targeting ${SIGNOZ_ENDPOINT}`);
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
