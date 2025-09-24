import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { processVideoPipeline } from '../utils/videoProcessor.js';
import { Video } from '../models/video.model.js';
import logger from '../utils/logger.js';

export const createVideoWorker = (io) => {
  const worker = new Worker(
    'video-processing',
    async (job) => {
      const { videoLocalPath, thumbnailLocalPath, userId, videoData } =
        job.data;

      try {
        logger.info(`[Worker] Starting video processing for job ${job.id}`);

        // The existing video processor is already great, we just need to call it.
        const { masterPlaylist, duration, variants } =
          await processVideoPipeline(videoLocalPath, io, userId);

        // Convert the variants array into an object map (e.g., { '720p': { url: '...' } })
        const variantsMap = variants.reduce((acc, variant) => {
          if (variant && variant.label) {
            acc[variant.label] = variant;
          }
          return acc;
        }, {});
        // Update the video record with the processing result
        const video = await Video.findByIdAndUpdate(
          videoData.videoId,
          {
            'videoFile.url': masterPlaylist,
            'videoFile.eager': variantsMap, // Save the object map
            duration: Math.round(duration || 0),
            status: 'published', // Mark as published
            isPublished: true,
          },
          { new: true }
        );

        logger.info(`[Worker] ✅ Video processing completed for job ${job.id}`);
        return video;
      } catch (error) {
        logger.error(
          `[Worker] ❌ Video processing failed for job ${job.id}:`,
          error
        );
        // Update video status to 'failed' in DB
        await Video.findByIdAndUpdate(videoData.videoId, { status: 'failed' });
        throw error; // Re-throw to let BullMQ handle the failure
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
