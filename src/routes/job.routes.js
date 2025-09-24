import { Router } from 'express';
import { getJobStatus } from '../controllers/job.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/:jobId').get(verifyJWT, getJobStatus);

export default router;
