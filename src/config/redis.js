import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redisURL = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';

const connectionOptions = {
  // Enable TLS for production (Upstash requires it)
  tls: redisURL.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined,
  maxRetriesPerRequest: null, // Let BullMQ handle retries
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
};

// ioredis automatically parses the password from the URL
export const redisConnection = new Redis(redisURL, connectionOptions);

redisConnection.on('error', (err) => {
  logger.error('❌ Redis connection error for BullMQ:', err.message);
});

redisConnection.on('connect', () => {
  logger.info('✅ Redis connected successfully for BullMQ');
});
