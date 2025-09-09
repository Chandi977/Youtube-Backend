import mongoose from 'mongoose';
import { DB_NAME } from '../constants.js'; // your constants file
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in .env file');
    }
    // console.log(process.env.MONGODB_URI, DB_NAME);

    // console.log('🔌 Connecting to MongoDB...');
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    // console.log(connectionInstance);

    // console.log(
    //   `✅ MongoDB Connected: ${connectionInstance.connection.host}/${DB_NAME}`
    // );
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1); // Exit the process if DB connection fails
  }
};

export default connectDB;
