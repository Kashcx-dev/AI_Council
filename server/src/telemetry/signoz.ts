import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, metrics } from '@opentelemetry/api';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : {},
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

export function initTelemetry() {
  try {
    sdk.start();
    console.log('[SigNoz Telemetry] Initialized with auto-instrumentations');
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
