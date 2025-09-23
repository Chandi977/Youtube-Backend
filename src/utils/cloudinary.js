import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadOnCloudinary = async (
  localFilePath,
  type = 'auto',
  io = null,
  userId = null
) => {
  if (!localFilePath) return null;

  let resourceType = 'auto';
  if (type === 'video') resourceType = 'video';
  else if (type === 'image') resourceType = 'image';

  try {
    const options = {
      resource_type: resourceType,
      use_filename: false,
      unique_filename: true,
    };

    const response = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );

      const readStream = fs.createReadStream(localFilePath);
      const fileSize = fs.statSync(localFilePath).size;
      let uploadedBytes = 0;
      const startTime = Date.now();

      readStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const percentage = Math.round((uploadedBytes / fileSize) * 100);
        const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
        const uploadSpeed = uploadedBytes / elapsedTime; // bytes per second
        const remainingBytes = fileSize - uploadedBytes;
        const eta =
          uploadSpeed > 0 ? Math.round(remainingBytes / uploadSpeed) : 'N/A';

        // Emit progress event if io and userId are provided
        if (io && userId) {
          io.to(userId.toString()).emit('upload_progress', {
            percentage,
            eta, // Estimated time remaining in seconds
            source: 'cloudinary',
          });
        }
      });

      readStream.on('end', () => {
        if (io && userId) {
          io.to(userId.toString()).emit('upload_progress', {
            percentage: 100,
            eta: 0,
            source: 'cloudinary',
          });
        }
      });

      readStream.pipe(uploadStream);
    });

    // Safeguard: Check if the upload response is valid before proceeding
    if (!response || !response.public_id) {
      console.error('Invalid response from Cloudinary:', response);
      throw new Error('Cloudinary upload failed to return a valid public_id.');
    }

    // Step 2: If video, generate adaptive streams asynchronously
    if (resourceType === 'video') {
      cloudinary.uploader
        .explicit(response.public_id, {
          resource_type: 'video',
          type: 'upload',
          eager: [
            { format: 'mp4', quality: 'auto', width: 1920 },
            { format: 'mp4', quality: '70', width: 1280 },
            { format: 'mp4', quality: '60', width: 854 },
            { format: 'mp4', quality: '50', width: 640 },
          ],
          eager_async: true,
        })
        .then(() => console.log('Adaptive streams processing started'))
        .catch((err) => console.error('Eager processing error:', err));
    }

    // Remove local file
    fs.existsSync(localFilePath) && fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    fs.existsSync(localFilePath) && fs.unlinkSync(localFilePath);
    console.error('Cloudinary upload error:', error.message || error);
    throw new Error('Cloudinary upload failed: ' + error.message);
  }
};

const deleteFromCloudinary = async (publicId, type = 'video') => {
  if (!publicId) return null;
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: type });
  } catch (error) {
    console.error('Cloudinary delete error:', error.message || error);
    return null;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
