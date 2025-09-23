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
  folder = null,
  publicId = null
) => {
  if (!localFilePath) return null;

  try {
    const options = {
      resource_type: type,
      unique_filename: true,
      overwrite: true,
    };

    if (folder) {
      options.folder = folder;
    }
    if (publicId) {
      options.public_id = publicId;
      options.unique_filename = false; // Don't append random chars when public_id is set
    }

    const response = await cloudinary.uploader.upload(localFilePath, options);

    // Remove local file
    fs.existsSync(localFilePath) && fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    // Ensure temp file is deleted on failure
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
