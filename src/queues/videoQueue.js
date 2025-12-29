import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import logger from '../utils/logger.js';

export const videoQueue = redisConnection
  ? new Queue('video-processing', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // Wait 5s before first retry, then 10s, 20s
        },
        removeOnComplete: 100, // Keep 100 completed jobs
        removeOnFail: 500, // Keep 500 failed jobs
      },
    })
  : null;

if (!videoQueue) {
  logger.warn('Video queue not initialized because Redis is disabled.');
}
