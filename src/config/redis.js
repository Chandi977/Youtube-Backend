import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redisURL = process.env.UPSTASH_REDIS_URL;

if (!redisURL) {
  logger.warn(
    '❌ UPSTASH_REDIS_URL not found. Redis operations will be disabled.'
  );
}

// ioredis automatically parses the password from the URL
export const redisConnection = redisURL
  ? new Redis(redisURL, {
      // Enable TLS for Upstash
      tls: {
        rejectUnauthorized: false,
      },
      maxRetriesPerRequest: null, // Important for BullMQ
      enableOfflineQueue: true, // Queue commands when connection is lost
    })
  : null;

if (redisConnection) {
  redisConnection.on('connect', () =>
    logger.info('✅ Redis connected successfully.')
  );
  redisConnection.on('error', (err) =>
    logger.error('❌ Redis connection error:', err.message)
  );
  redisConnection.on('close', () =>
    logger.warn('⚠️ Redis connection closed. Attempting to reconnect...')
  );
}

export const isRedisEnabled = !!redisConnection;
