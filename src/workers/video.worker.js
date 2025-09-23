import { Worker } from 'bullmq';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

import { connection, publisher } from '../queues/redis.js';
import { ApiError } from '../utils/ApiError.js';
import connectDB from '../config/index.js';
import { Video } from '../models/video.model.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
ffmpeg.setFfmpegPath(ffmpegStatic);

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 1;

const publishEvent = async (uploaderId, payload) => {
  const channel = `video-processing:${uploaderId}`;
  try {
    await publisher.publish(channel, JSON.stringify(payload));
  } catch (err) {
    logger.error('Failed to publish progress to Redis', {
      error: err.message,
      channel,
    });
  }
};

const ensureFolder = (folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
};

const runEncodeForResolution = (
  inputPath,
  outputFolder,
  res,
  videoId,
  uploaderId
) => {
  logger.info(`Starting encode for ${res.label}`, {
    videoId,
    resolution: res.label,
  });
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputFolder, `${res.label}.m3u8`);
    const segmentTemplate = path.join(outputFolder, `${res.label}_%03d.ts`);

    let lastTime = Date.now();
    let lastPercent = 0;

    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${res.width}:${res.height}`,
        '-c:a aac',
        '-ar 48000',
        `-b:v ${res.bitrate}k`,
        '-hls_time 6',
        '-hls_playlist_type vod',
        `-hls_segment_filename ${segmentTemplate}`,
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        const percent = Math.max(
          0,
          Math.min(100, Math.round(progress.percent || 0))
        );
        const deltaPercent = percent - lastPercent;

        if (deltaPercent > 0 && elapsed > 0.3) {
          const speed = deltaPercent / elapsed;
          const remaining = 100 - percent;
          const eta = Math.round(remaining / (speed || 0.0001));

          publishEvent(uploaderId, {
            type: 'processing-progress',
            videoId,
            resolution: res.label,
            percent,
            eta,
          });

          lastTime = now;
          lastPercent = percent;
        }
      })
      .on('end', () => {
        const url = `/videos/${videoId}/${res.label}.m3u8`;
        publishEvent(uploaderId, {
          type: 'processing-complete',
          videoId,
          resolution: res.label,
          url,
        }).catch(() => {});
        resolve({
          url,
          label: res.label,
          width: res.width,
          height: res.height,
        });
      })
      .on('error', (err) => {
        logger.error(`FFmpeg failed for ${res.label}`, {
          videoId,
          error: err.message,
        });
        reject(
          new ApiError(500, `FFmpeg failed for ${res.label}: ${err.message}`)
        );
      })
      .run();
  });
};

const processVideoJob = async (job) => {
  const { videoPath: inputPath, videoId, uploaderId } = job.data;
  logger.info('Processing video job', { jobId: job.id, videoId, uploaderId });

  const outputFolder = path.join('public', 'videos', videoId);
  ensureFolder(outputFolder);

  const resolutions = [
    { label: '144p', width: 256, height: 144, bitrate: 200 },
    { label: '240p', width: 426, height: 240, bitrate: 400 },
    { label: '360p', width: 640, height: 360, bitrate: 800 },
    { label: '480p', width: 854, height: 480, bitrate: 1200 },
    { label: '720p', width: 1280, height: 720, bitrate: 2500 },
    { label: '1080p', width: 1920, height: 1080, bitrate: 5000 },
  ];

  const encodePromises = resolutions.map((res) => {
    return runEncodeForResolution(
      inputPath,
      outputFolder,
      res,
      videoId,
      uploaderId
    );
  });

  const resolutionData = await Promise.all(encodePromises);

  // --- Create Master HLS Playlist ---
  // This file tells the player about all available resolutions.
  let masterPlaylistContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
  resolutionData.forEach((res) => {
    // Bandwidth is bitrate in bits per second (bitrate is in kbps)
    const bandwidth = res.label.includes('p')
      ? parseInt(res.label, 10) * 10 * 1024 // Heuristic for p-levels
      : 2000 * 1024;
    masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res.width}x${res.height}\n`;
    masterPlaylistContent += `${path.basename(res.url)}\n`;
  });

  const masterPlaylistPath = path.join(outputFolder, 'index.m3u8');
  fs.writeFileSync(masterPlaylistPath, masterPlaylistContent);
  logger.info('Master HLS playlist created', {
    videoId,
    path: masterPlaylistPath,
  });

  // Once all resolutions are ready, update the video document
  const finalVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        'videoFile.eager': resolutionData.map((r) => ({
          secure_url: r.url,
          width: r.width,
          height: r.height,
          quality: r.label,
        })),
        'videoFile.url': `/videos/${videoId}/index.m3u8`, // Point to the master playlist
        status: 'published',
        isPublished: true,
      },
    },
    { new: true }
  );

  if (!finalVideo) throw new ApiError(404, 'Video not found after processing.');

  try {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    logger.info('Cleaned up temporary input file', {
      videoId,
      path: inputPath,
    });
  } catch (err) {
    logger.warn('Failed to delete input file after processing', {
      videoId,
      error: err.message,
    });
  }

  await publishEvent(uploaderId, {
    type: 'video-ready',
    videoId,
    resolutions: resolutionData,
  });

  return { videoId, resolutions: resolutionData.map((r) => r.url) };
};

connectDB()
  .then(() => {
    logger.info('✅ Video worker connected to MongoDB.');
    const worker = new Worker('video-processing', processVideoJob, {
      connection,
      concurrency: CONCURRENCY,
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed`, {
        jobId: job.id,
        videoId: job.data?.videoId,
        error: err.message,
        stack: err.stack,
      });
      const { uploaderId, videoId } = job.data;
      if (uploaderId) {
        publishEvent(uploaderId, {
          type: 'processing-failed',
          videoId,
          message: err.message,
        });
        Video.findByIdAndUpdate(videoId, { $set: { status: 'failed' } }).catch(
          (dbErr) =>
            logger.error('Failed to update video status to "failed"', {
              videoId,
              error: dbErr.message,
            })
        );
      }
    });

    worker.on('completed', (job, result) => {
      logger.info(`Job completed successfully`, { jobId: job.id, result });
    });

    logger.info('🚀 Video worker started', { concurrency: CONCURRENCY });
  })
  .catch((err) => {
    logger.error('❌ Video worker failed to start', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
