import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { ApiError } from './ApiError.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

export const processVideo = async (inputPath, videoId) => {
  const outputFolder = path.join('videos', videoId);
  fs.mkdirSync(outputFolder, { recursive: true });

  const resolutions = [
    { label: '144p', width: 256, height: 144, bitrate: 200 },
    { label: '240p', width: 426, height: 240, bitrate: 500 },
    { label: '360p', width: 640, height: 360, bitrate: 800 },
    { label: '480p', width: 854, height: 480, bitrate: 1200 },
    { label: '720p', width: 1280, height: 720, bitrate: 2500 },
    { label: '1080p', width: 1920, height: 1080, bitrate: 5000 },
  ];

  const resolutionsUrls = [];

  for (const res of resolutions) {
    const outputPath = path.join(outputFolder, `${res.label}.m3u8`);
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-vf scale=${res.width}:${res.height}`,
          '-c:a aac',
          '-ar 48000',
          `-b:v ${res.bitrate}k`,
          '-hls_time 6',
          '-hls_playlist_type vod',
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => {
          reject(new ApiError(500, `FFmpeg processing failed: ${err.message}`));
        })
        .run();
    });
    resolutionsUrls.push({
      label: res.label,
      url: `/videos/${videoId}/${res.label}.m3u8`,
    });
  }

  return resolutionsUrls;
};

/**
 * Compresses a video file using FFmpeg to reduce its size.
 * @param {string} inputPath - The path to the original video file.
 * @returns {Promise<string>} A promise that resolves with the path to the compressed video file.
 */
export const compressVideo = (inputPath) => {
  // Create a new path for the compressed file in the same directory
  const fileExtension = path.extname(inputPath);
  const baseName = path.basename(inputPath, fileExtension);
  const dirName = path.dirname(inputPath);
  const outputPath = path.join(dirName, `${baseName}-compressed.mp4`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-vcodec libx264',
        '-crf 28', // Constant Rate Factor for quality/size balance
        '-preset veryfast',
        '-acodec aac',
      ])
      .output(outputPath)
      .on('end', () => {
        // Delete the original, larger file to save space
        fs.unlink(inputPath, (unlinkErr) => {
          if (unlinkErr) {
            console.error(
              `Failed to delete original uncompressed file: ${inputPath}`,
              unlinkErr
            );
          }
        });
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(new ApiError(500, `FFmpeg compression failed: ${err.message}`));
      });
  });
};
