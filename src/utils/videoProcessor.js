import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const processVideo = async (inputPath, videoId) => {
  const outputFolder = path.join('videos', videoId);
  fs.mkdirSync(outputFolder, { recursive: true });

  const resolutions = [
    { label: '144p', width: 256, height: 144, bitrate: 200 },
    { label: '360p', width: 640, height: 360, bitrate: 800 },
    { label: '480p', width: 854, height: 480, bitrate: 1200 },
    { label: '720p', width: 1280, height: 720, bitrate: 2500 },
    { label: '1080p', width: 1920, height: 1080, bitrate: 5000 },
  ];

  const resolutionsUrls = [];

  for (const res of resolutions) {
    const outputPath = path.join(outputFolder, `${res.label}.m3u8`);
    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -i "${inputPath}" -vf scale=${res.width}:${res.height} -c:a aac -ar 48000 -b:v ${res.bitrate}k -hls_time 6 -hls_playlist_type vod "${outputPath}"`;
      exec(cmd, (err) => (err ? reject(err) : resolve()));
    });
    resolutionsUrls.push({
      label: res.label,
      url: `/videos/${videoId}/${res.label}.m3u8`,
    });
  }

  return resolutionsUrls;
};
