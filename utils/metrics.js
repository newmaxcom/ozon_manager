import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  register,
} from "prom-client";

collectDefaultMetrics();

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10, 30],
});

export function metricsMiddleware(req, res, next) {
  if (req.path === "/metrics") return next();
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ?? "_unmatched";
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
}

export async function metricsHandler(_req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
