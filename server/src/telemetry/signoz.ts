import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, metrics } from '@opentelemetry/api';

const tracesEndpoint = process.env.SIGNOZ_ENDPOINT
  ? `${process.env.SIGNOZ_ENDPOINT.replace(/\/$/, '')}/v1/traces`
  : (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces');

const headers: Record<string, string> = {};
if (process.env.SIGNOZ_INGESTION_KEY) {
  headers['signoz-ingestion-key'] = process.env.SIGNOZ_INGESTION_KEY;
}
if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
  try {
    Object.assign(headers, JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS));
  } catch (e) {
    console.warn('[SigNoz Telemetry] Could not parse OTEL_EXPORTER_OTLP_HEADERS JSON');
  }
}

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
  headers,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'ai-council-conductor',
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

export function initTelemetry() {
  try {
    sdk.start();
    console.log('[SigNoz Telemetry] Initialized with auto-instrumentations for service: ai-council-conductor');

    const handleShutdown = (signal: string) => {
      console.log(`[SigNoz Telemetry] Received ${signal}. Flushing telemetry & shutting down...`);
      sdk.shutdown()
        .then(() => console.log('[SigNoz Telemetry] SDK shut down cleanly.'))
        .catch((err) => console.error('[SigNoz Telemetry] Error during SDK shutdown:', err))
        .finally(() => process.exit(0));
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
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
