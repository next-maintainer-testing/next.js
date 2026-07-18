import * as http from 'node:http';
import { trace } from '@opentelemetry/api';

function requestHeaders(origin) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${origin}/check`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

export async function GET(request) {
  const tracer = trace.getTracer('next-64879-reproduction');
  return tracer.startActiveSpan('explicit-parent-span', async (span) => {
    try {
      const headers = await requestHeaders(new URL(request.url).origin);
      return Response.json({ traceparent: headers.traceparent ?? null });
    } finally {
      span.end();
    }
  });
}
