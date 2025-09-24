// videoProcessor.cloudinary.js
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { v4 as uuidv4 } from 'uuid';
import { ApiError } from './ApiError.js';
import { uploadOnCloudinary } from './cloudinary.js';
import logger from './logger.js';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const MAX_RETRIES = 2;

const formatTime = (seconds) => {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * Compress input -> compressedFile
 */
const compressVideo = (inputPath, io = null, userId = null) => {
  logger.info(`[Compression] Start: ${inputPath}`);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const out = path.join(dir, `${base}-compressed.mp4`);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    ffmpeg(inputPath)
      .outputOptions([
        '-vcodec libx264',
        '-crf 28',
        '-preset veryfast',
        '-acodec aac',
      ])
      .output(out)
      .on('start', (cmd) => logger.info(`[FFmpeg] Compress CMD: ${cmd}`))
      .on('progress', (progress) => {
        if (!progress || !progress.percent) return;
        const percent = Math.floor(progress.percent);
        const elapsed = (Date.now() - startedAt) / 1000;
        const estimatedTotal = elapsed / (percent / 100);
        const eta = estimatedTotal - elapsed;

        const msg = `[Compression] ${percent}% ETA=${formatTime(eta)}`;
        process.stdout.write(msg + '\r');

        if (io && userId) {
          io.to(userId.toString()).emit('upload_progress', {
            stage: 'compression',
            percent,
            eta: formatTime(eta),
          });
        }
      })
      .on('end', () => {
        process.stdout.write('\n'); // finish progress line
        logger.info(`[Compression] Done: ${out}`);
        resolve(out);
      })
      .on('error', (err) => {
        process.stdout.write('\n');
        logger.error('[Compression] ffmpeg error', err);
        reject(new ApiError(500, `Compression failed: ${err.message}`));
      })
      .run();
  });
};

/**
 * Process single resolution into HLS
 */
const processResolution = (
  inputPath,
  outputFolder,
  res,
  duration,
  io = null,
  userId = null
) => {
  const resFolder = path.join(outputFolder, res.label);
  fs.mkdirSync(resFolder, { recursive: true });
  const playlistPath = path.join(resFolder, `${res.label}.m3u8`);

  return new Promise((resolve, reject) => {
    logger.info(`[HLS ${res.label}] Start -> ${playlistPath}`);
    const start = Date.now();
    let segmentCount = 0;

    const watcher = fs.watch(resFolder, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.ts')) {
        segmentCount++;
      }
    });

    const scaleFilter = `scale=-2:${res.height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;

    ffmpeg(inputPath)
      .outputOptions([
        `-vf ${scaleFilter}`,
        '-c:a aac',
        '-ar 48000',
        `-b:v ${res.bitrate}`,
        `-maxrate ${res.maxrate}`,
        `-bufsize ${res.bufsize}`,
        '-hls_time 6',
        '-hls_playlist_type vod',
        `-hls_segment_filename ${path.join(resFolder, 'segment-%03d.ts')}`,
      ])
      .output(playlistPath)
      .on('start', (cmd) => logger.info(`[HLS ${res.label}] ffmpeg: ${cmd}`))
      .on('progress', (progress) => {
        if (!progress || !progress.timemark) return;
        const [hh, mm, ss] = progress.timemark.split(':').map(parseFloat);
        const seconds = hh * 3600 + mm * 60 + ss;
        const percent = Math.min((seconds / duration) * 100, 100);
        const elapsed = (Date.now() - start) / 1000;
        const eta = percent > 0 ? elapsed / (percent / 100) - elapsed : -1;

        const msg = `[HLS ${res.label}] ${percent.toFixed(
          1
        )}% Segments=${segmentCount} ETA=${formatTime(eta)}`;
        process.stdout.write(msg + '\r');

        if (io && userId) {
          io.to(userId.toString()).emit('upload_progress', {
            stage: `hls-${res.label}`,
            percent: Math.round(percent),
            eta: formatTime(eta),
          });
        }
      })
      .on('end', () => {
        watcher.close();
        process.stdout.write('\n');
        logger.info(`[HLS ${res.label}] Finished, Segments=${segmentCount}`);
        resolve({ folder: resFolder, playlist: playlistPath });
      })
      .on('error', (err) => {
        watcher.close();
        process.stdout.write('\n');
        logger.error(`[HLS ${res.label}] Error`, err);
        reject(
          new ApiError(500, `[FFmpeg] ${res.label} failed: ${err.message}`)
        );
      })
      .run();
  });
};

/**
 * Upload HLS to Cloudinary
 */
const uploadHLSFolderToCloudinary = async (
  folderPath,
  videoId,
  resolutionLabel
) => {
  const files = fs
    .readdirSync(folderPath)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.m3u8'));
  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const localPath = path.join(folderPath, filename);
    const publicId = `hls/${videoId}/${resolutionLabel}/${path.parse(filename).name}`;
    const res = await uploadOnCloudinary(localPath, 'raw', null, publicId);
    uploaded.push({
      filename,
      secure_url: res.secure_url,
      public_id: res.public_id,
    });
    process.stdout.write(
      `[Upload ${resolutionLabel}] ${i + 1}/${files.length} -> ${res.secure_url}\r`
    );
  }
  process.stdout.write('\n');

  const playlistEntry = uploaded.find(
    (u) => u.filename === `${resolutionLabel}.m3u8`
  );
  const playlistUrl = playlistEntry ? playlistEntry.secure_url : null;

  return { playlistUrl, uploadedFiles: uploaded };
};

/**
 * Master playlist builder
 */
const buildMasterPlaylistContent = (variants) => {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  variants.forEach((v) => {
    const bandwidth = Math.round((v.bitrate || 1000) * 1000);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${v.width}x${v.height}`
    );
    lines.push(v.playlistUrl);
  });
  return lines.join('\n') + '\n';
};

/**
 * Main pipeline
 */
export const processVideoPipeline = async (
  inputPath,
  io = null,
  userId = null
) => {
  const videoId = uuidv4();
  const tempBase = path.join('public', 'temp', 'hls', videoId);
  fs.mkdirSync(tempBase, { recursive: true });

  // 1. Check if the input file exists before starting the pipeline
  if (!fs.existsSync(inputPath)) {
    throw new ApiError(400, 'Input file not found: ' + inputPath);
  }

  const resolutions = [
    {
      label: '144p',
      height: 144,
      width: 256,
      bitrate: '200k',
      maxrate: '250k',
      bufsize: '400k',
    },
    {
      label: '240p',
      height: 240,
      width: 426,
      bitrate: '400k',
      maxrate: '500k',
      bufsize: '1000k',
    },
    {
      label: '360p',
      height: 360,
      width: 640,
      bitrate: '800k',
      maxrate: '1000k',
      bufsize: '1600k',
    },
    {
      label: '480p',
      height: 480,
      width: 854,
      bitrate: '1200k',
      maxrate: '1500k',
      bufsize: '2400k',
    },
    {
      label: '720p',
      height: 720,
      width: 1280,
      bitrate: '2500k',
      maxrate: '3000k',
      bufsize: '5000k',
    },
    {
      label: '1080p',
      height: 1080,
      width: 1920,
      bitrate: '5000k',
      maxrate: '6000k',
      bufsize: '10000k',
    },
  ];

  let compressed = '';
  try {
    compressed = await compressVideo(inputPath, io, userId);
  } catch (err) {
    logger.error('[Pipeline] Compression failed', err);
    throw err;
  }

  const { duration, height: videoHeight } = await new Promise((res, rej) => {
    ffmpeg.ffprobe(compressed, (err, metadata) => {
      if (err) {
        return rej(new ApiError(500, 'Failed to read video metadata.'));
      }
      const videoStream = metadata.streams.find(
        (s) => s.codec_type === 'video'
      );
      const duration = metadata.format.duration || 0;
      const height = videoStream ? videoStream.height : 0;
      if (height === 0) {
        logger.warn('[Pipeline] Could not determine video height.');
      }
      return res({ duration, height });
    });
  });
  logger.info(`[Pipeline] Duration: ${duration}s, Height: ${videoHeight}px`);

  // For debugging on resource-constrained machines, you can set this to 1
  const CONCURRENCY_LIMIT = 3;
  const tasks = resolutions.map((res) => async () => {
    try {
      if (videoHeight > 0 && res.height > videoHeight) {
        logger.info(
          `[Pipeline] Skipping ${res.label} as source height (${videoHeight}p) is smaller.`
        );
        return null;
      }
      logger.info(`[Pipeline] Starting ${res.label}`);
      const { folder } = await processResolution(
        compressed,
        tempBase,
        res,
        duration,
        io,
        userId
      );
      const uploadResult = await uploadHLSFolderToCloudinary(
        folder,
        videoId,
        res.label
      );
      if (!uploadResult.playlistUrl) {
        logger.warn(`[Pipeline] Playlist URL missing for ${res.label}`);
        return null;
      }
      return {
        label: res.label,
        width: res.width,
        height: res.height,
        bitrate: parseInt(res.bitrate, 10), // Store as number for DB
        playlistUrl: uploadResult.playlistUrl,
      };
    } catch (error) {
      logger.error(`[Pipeline] Task for ${res.label} failed`, {
        message: error.message,
      });
      return null; // Return null to indicate failure for this resolution
    }
  });

  const variantResults = [];
  const executing = [];
  for (const task of tasks) {
    const promise = task().then((result) => {
      if (result) variantResults.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });
    executing.push(promise);
    if (executing.length >= CONCURRENCY_LIMIT) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  const usableVariants = variantResults.filter((v) => v && v.playlistUrl);
  if (usableVariants.length === 0)
    throw new ApiError(500, 'No HLS variants created');

  const masterContent = buildMasterPlaylistContent(usableVariants);
  const masterLocalPath = path.join(tempBase, 'master.m3u8');
  fs.writeFileSync(masterLocalPath, masterContent, 'utf8');

  const masterUpload = await uploadOnCloudinary(
    masterLocalPath,
    'raw',
    null,
    `hls/${videoId}/master`
  );

  try {
    if (fs.existsSync(tempBase))
      fs.rmSync(tempBase, { recursive: true, force: true });
    if (fs.existsSync(compressed)) fs.unlinkSync(compressed);
  } catch (e) {
    logger.warn('Cleanup error', e);
  }

  return {
    videoId,
    masterPlaylist: masterUpload.secure_url,
    variants: usableVariants,
    duration,
  };
};
