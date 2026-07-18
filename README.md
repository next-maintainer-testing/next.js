# Next.js issue 74331 reproduction

This minimal npm-workspace app retains the reporter's conflicting OpenTelemetry dependency branches: the browser workspace uses Grafana Faro (OTLP 0.53), while server instrumentation uses the gRPC exporter (OTLP 0.57). Run `npm install` and `npm run dev`; the reported symptom is `TypeError: this.getDefaultUrl is not a function` during instrumentation startup.
