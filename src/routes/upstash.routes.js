import { Router } from 'express';
import { upstashTest } from '../controllers/upstash.controller.js';

const router = Router();

router.get('/upstash-test', upstashTest);

export default router;
