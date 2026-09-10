import { Router } from 'express';
import { convert } from '../controllers/conversion.controller.js';
import { uploadFiles } from '../middleware/upload.middleware.js';

export const conversionRouter = Router();
conversionRouter.post('/convert', uploadFiles, convert);
