import * as https from 'https';
import { URL } from 'url';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ISpanExporterProvider } from './span-exporter-provider.interface';
import { ObservabilityProviderName } from './observability-provider.types';

/**
 * AWS CloudWatch / X-Ray provider.
 *
 * Sends OTLP-proto traces to `https://xray.<region>.amazonaws.com/v1/traces`
 * (CloudWatch Application Signals / X-Ray OTLP endpoint) with SigV4-signed
 * requests. Credentials come from the default AWS credential chain:
 *   env vars → shared config/credentials file → ECS/EC2 instance role.
 *
 * Implementation note: rather than subclassing OTLPTraceExporter (whose
 * internal `send()` API has shifted between versions), we implement a
 * minimal SpanExporter here and use @opentelemetry/otlp-transformer for the
 * proto serialization.
 */
export class AwsExporterProvider implements ISpanExporterProvider {
  getName(): ObservabilityProviderName {
    return 'aws';
  }

  buildExporters(): SpanExporter[] {
    const region = process.env.AWS_OTEL_REGION;
    if (!region) {
      throw new Error(
        'AWS_OTEL_REGION is required when OBSERVABILITY_PROVIDER=aws'
      );
    }
    const endpoint =
      process.env.AWS_OTEL_ENDPOINT || `https://xray.${region}.amazonaws.com/v1/traces`;

    return [new SigV4OtlpTraceExporter({ endpoint, region })];
  }
}

interface SigV4ExporterOptions {
  endpoint: string;
  region: string;
}

/**
 * Minimal OTLP-proto span exporter that signs each batch with SigV4 for the
 * AWS `xray` service. Uses @opentelemetry/otlp-transformer for serialization
 * and @aws-sdk/signature-v4 + @aws-sdk/credential-providers for signing.
 */
class SigV4OtlpTraceExporter implements SpanExporter {
  private readonly url: URL;
  private readonly region: string;
  private shuttingDown = false;

  // Lazy-loaded to avoid pulling the AWS SDK into the Phoenix/Azure code paths.
  private signerPromise: Promise<any> | null = null;
  private serializer: any | null = null;

  constructor(opts: SigV4ExporterOptions) {
    this.url = new URL(opts.endpoint);
    this.region = opts.region;
  }

  private async getSigner(): Promise<any> {
    if (!this.signerPromise) {
      this.signerPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SignatureV4 } = require('@smithy/signature-v4');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Sha256 } = require('@aws-crypto/sha256-js');
        return new SignatureV4({
          credentials: fromNodeProviderChain(),
          region: this.region,
          service: 'xray',
          sha256: Sha256,
        });
      })();
    }
    return this.signerPromise;
  }

  private getSerializer(): any {
    if (!this.serializer) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProtobufTraceSerializer } = require('@opentelemetry/otlp-transformer');
      this.serializer = ProtobufTraceSerializer;
    }
    return this.serializer;
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): Promise<void> {
    if (this.shuttingDown) {
      resultCallback({ code: ExportResultCode.FAILED, error: new Error('Exporter shut down') });
      return;
    }

    try {
      const serializer = this.getSerializer();
      const body: Uint8Array = serializer.serializeRequest(spans);
      const signer = await this.getSigner();

      const request = {
        method: 'POST',
        protocol: this.url.protocol,
        hostname: this.url.hostname,
        port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
        path: this.url.pathname + (this.url.search || ''),
        headers: {
          'content-type': 'application/x-protobuf',
          'content-length': String(body.length),
          host: this.url.hostname,
        },
        body: Buffer.from(body),
      };

      const signed = await signer.sign(request);

      await this.sendSignedRequest(signed, body);
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  private sendSignedRequest(signed: any, body: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: 'POST',
          hostname: this.url.hostname,
          port: this.url.port || 443,
          path: this.url.pathname + (this.url.search || ''),
          headers: signed.headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              resolve();
            } else {
              const respBody = Buffer.concat(chunks).toString('utf8');
              reject(new Error(`AWS OTLP export failed: HTTP ${status} ${respBody}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(Buffer.from(body));
      req.end();
    });
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
  }

  async forceFlush(): Promise<void> {
    // No internal buffering; BatchSpanProcessor owns the buffer.
  }
}
