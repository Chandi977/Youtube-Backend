import mongoose from 'mongoose'; // Importing mongoose to interact with MongoDB.
import { DB_NAME } from '../constants.js'; // Importing the database name from constants file.

// Function to establish a connection to MongoDB
const connectDB = async () => {
  try {
    // Attempt to connect to MongoDB using the URI from environment variables and the specified DB name
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );

    // Log successful connection along with the host of the database
    console.log(
      `\n MONGODB connected !! DB HOST ${connectionInstance.connection.host}`
    );
  } catch (error) {
    // Log the error if the connection fails
    console.log('MONGODB CONNECTION FAILED :', error);

    // Exit the process with failure code (1) if connection fails
    process.exit(1);
  }
};

export default connectDB; // Exporting the connectDB function as default for use in other parts of the application.
