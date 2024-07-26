import multer from 'multer';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/temp');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // isko change krna hai 7:38:00
  },
});

export const upload = multer({
  storage,
});
