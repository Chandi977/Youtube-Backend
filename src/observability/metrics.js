import client from 'prom-client';

const register = new client.Registry();
if (process.env.NODE_ENV !== 'test') {
  client.collectDefaultMetrics({ register });
}

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.7, 1.5, 3, 5, 10],
  registers: [register],
});

const redisOpsTotal = new client.Counter({
  name: 'redis_ops_total',
  help: 'Total Redis operations',
  labelNames: ['op', 'status'],
  registers: [register],
});

const queueJobsGauge = new client.Gauge({
  name: 'queue_jobs_total',
  help: 'Queue job counts by status',
  labelNames: ['queue', 'status'],
  registers: [register],
});

const workerJobDuration = new client.Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Worker job duration in seconds',
  labelNames: ['queue', 'status'],
  buckets: [0.1, 0.3, 0.7, 1.5, 3, 5, 10, 30, 60],
  registers: [register],
});

export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationMs / 1000);
  });

  next();
};

export const recordRedisOp = (op, ok = true) => {
  redisOpsTotal.inc({ op, status: ok ? 'ok' : 'err' });
};

export const recordWorkerJob = (queue, status, durationSeconds) => {
  workerJobDuration.observe({ queue, status }, durationSeconds);
};

export const updateQueueMetrics = async (queue) => {
  if (!queue) return;
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  );
  const queueName = queue.name || 'queue';
  Object.entries(counts).forEach(([status, count]) => {
    queueJobsGauge.set({ queue: queueName, status }, count || 0);
  });
};

export const metricsRegister = register;
