import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Cloud name from Cloudinary account
  api_key: process.env.CLOUDINARY_API_KEY, // API key from Cloudinary account
  api_secret: process.env.CLOUDINARY_API_SECRET, // API secret from Cloudinary account
});

// Function to upload a file to Cloudinary
const uploadOnCloudinary = async (localFilePath) => {
  try {
    // If no file path is provided, return null
    if (!localFilePath) return null;

    // Upload the file to Cloudinary with automatic resource type detection
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto', // Automatically detect file type (e.g., image, video)
    });

    // File has been successfully uploaded
    // console.log('file is uploaded on cloudinary ', response.url); // Uncomment to log the URL of the uploaded file

    // Delete the local temporary file after successful upload
    fs.unlinkSync(localFilePath);

    return response; // Return the response from Cloudinary
  } catch (error) {
    // Delete the local temporary file in case of upload failure
    fs.unlinkSync(localFilePath); // Removes the file from local storage regardless of upload success
    console.error('Cloudinary upload error:', error);
    return null; // Return null if there was an error during upload
  }
};

export { uploadOnCloudinary }; // Export the function for use in other modules
