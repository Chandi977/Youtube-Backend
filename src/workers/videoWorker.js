import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { processVideoPipeline } from '../utils/videoProcessor.js';
import { Video } from '../models/video.model.js';
import logger from '../utils/logger.js';
import { recordWorkerJob } from '../observability/metrics.js';

export const createVideoWorker = (io) => {
  if (!redisConnection) {
    logger.warn('[Worker] Redis disabled; video worker not started.');
    return null;
  }

  const worker = new Worker(
    'video-processing',
    async (job) => {
      const { videoLocalPath, userId, videoData } = job.data;
      const startedAt = Date.now();

      try {
        logger.info(`[Worker] Starting video processing for job ${job.id}`);

        const { masterPlaylist, duration, variants } =
          await processVideoPipeline(videoLocalPath, io, userId);

        const variantsMap = variants.reduce((acc, variant) => {
          if (variant && variant.label) {
            acc[variant.label] = variant;
          }
          return acc;
        }, {});

        const video = await Video.findByIdAndUpdate(
          videoData.videoId,
          {
            'videoFile.url': masterPlaylist,
            'videoFile.eager': variantsMap,
            duration: Math.round(duration || 0),
            status: 'published',
            isPublished: true,
          },
          { new: true }
        );

        const durationSec = (Date.now() - startedAt) / 1000;
        recordWorkerJob('video-processing', 'completed', durationSec);
        logger.info(`[Worker] Video processing completed for job ${job.id}`);
        return video;
      } catch (error) {
        const durationSec = (Date.now() - startedAt) / 1000;
        recordWorkerJob('video-processing', 'failed', durationSec);
        logger.error(
          `[Worker] Video processing failed for job ${job.id}:`,
          error
        );
        await Video.findByIdAndUpdate(videoData.videoId, { status: 'failed' });
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: process.env.NODE_ENV === 'production' ? 1 : 2,
      limiter: { max: 5, duration: 60000 },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`[Worker] Job ${job.id} completed successfully.`);
    io.to(job.data.userId).emit('upload_completed', {
      jobId: job.id,
      video: result,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
    io.to(job?.data?.userId).emit('upload_failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
};
