const express = require('express');
const multer = require('multer');
const faceRecognitionService = require('../services/faceRecognition');
const { auth, requireFaceRecognition } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp').split(',');
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
    }
  }
});

// @route   POST /api/face/detect
// @desc    Detect faces in image
// @access  Public
router.post('/detect', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    const detection = await faceRecognitionService.detectFaces(req.file.buffer);
    
    res.json({
      success: true,
      data: {
        detected: true,
        confidence: detection.detection.score,
        boundingBox: detection.detection.box
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/face/validate
// @desc    Validate face quality
// @access  Public
router.post('/validate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    const qualityCheck = await faceRecognitionService.validateFaceQuality(req.file.buffer);
    
    res.json({
      success: true,
      data: qualityCheck
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/face/verify
// @desc    Verify face against user's stored embeddings
// @access  Private
router.post('/verify', requireFaceRecognition, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    const faceData = await faceRecognitionService.generateEmbedding(req.file.buffer);
    const bestMatch = await faceRecognitionService.findBestMatch(
      faceData.embedding, 
      req.user.faceEmbeddings
    );
    
    if (!bestMatch) {
      return res.status(401).json({
        success: false,
        message: 'Face verification failed',
        data: { verified: false }
      });
    }

    res.json({
      success: true,
      data: {
        verified: true,
        confidence: faceData.confidence,
        similarity: bestMatch.similarity,
        distance: bestMatch.distance
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router; 