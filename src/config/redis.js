import Redis from 'ioredis';
import logger from '../utils/logger.js';

export const redisConnection = new Redis(
  process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379',
  {
    // Upstash uses password for token, standard Redis might not
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    // Enable TLS for production (Upstash requires it)
    tls:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true,
  }
);

redisConnection.on('error', (err) => {
  logger.error('❌ Redis connection error for BullMQ:', err.message);
});

redisConnection.on('connect', () => {
  logger.info('✅ Redis connected successfully for BullMQ');
});
