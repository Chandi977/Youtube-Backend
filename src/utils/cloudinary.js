import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadOnCloudinary = async (localFilePath, type = 'auto') => {
  if (!localFilePath) return null;

  let resourceType = 'auto';
  if (type === 'video') resourceType = 'video';
  else if (type === 'image') resourceType = 'image';

  try {
    // Step 1: Upload without eager
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: resourceType,
      use_filename: false,
      unique_filename: true,
    });

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
