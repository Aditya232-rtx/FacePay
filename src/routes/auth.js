const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const faceRecognitionService = require('../services/faceRecognition');
const { auth, rateLimitByUser } = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
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

// Validation middleware
const validateRegistration = [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').matches(/^\+?[\d\s-()]+$/).withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', validateRegistration, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isVerified: user.isVerified,
          faceRecognitionEnabled: user.faceRecognitionEnabled
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateLogin, rateLimitByUser(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed attempts'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isVerified: user.isVerified,
          faceRecognitionEnabled: user.faceRecognitionEnabled,
          hasFaceEmbeddings: user.faceEmbeddings && user.faceEmbeddings.length > 0
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// @route   POST /api/auth/face-login
// @desc    Login user with face recognition
// @access  Public
router.post('/face-login', upload.single('faceImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face image is required'
      });
    }

    // Generate embedding from uploaded image
    const faceData = await faceRecognitionService.generateEmbedding(req.file.buffer);
    
    // Find user by face embedding
    const user = await User.findByFaceEmbedding(faceData.embedding);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Face not recognized. Please try again or use email/password login.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Face login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          isVerified: user.isVerified,
          faceRecognitionEnabled: user.faceRecognitionEnabled
        },
        token,
        faceRecognition: {
          confidence: faceData.confidence,
          distance: faceData.distance || 0
        }
      }
    });
  } catch (error) {
    console.error('Face login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Face login failed'
    });
  }
});

// @route   POST /api/auth/register-face
// @desc    Register face for user
// @access  Private
router.post('/register-face', auth, upload.single('faceImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face image is required'
      });
    }

    // Validate face quality
    const qualityCheck = await faceRecognitionService.validateFaceQuality(req.file.buffer);
    if (!qualityCheck.isAcceptable) {
      return res.status(400).json({
        success: false,
        message: 'Image quality is not acceptable. Please ensure:',
        details: {
          isDetected: qualityCheck.isDetected,
          confidence: qualityCheck.confidence,
          isCentered: qualityCheck.isCentered,
          brightness: qualityCheck.brightness,
          blur: qualityCheck.blur
        }
      });
    }

    // Generate embedding
    const faceData = await faceRecognitionService.generateEmbedding(req.file.buffer);
    
    // Save image
    const filename = `face_${req.user._id}_${Date.now()}.jpg`;
    const imageUrl = await faceRecognitionService.saveImage(req.file.buffer, filename);

    // Add face embedding to user
    req.user.faceEmbeddings.push({
      embedding: faceData.embedding,
      confidence: faceData.confidence
    });

    // Update profile image if not set
    if (!req.user.profileImage) {
      req.user.profileImage = imageUrl;
    }

    await req.user.save();

    res.json({
      success: true,
      message: 'Face registered successfully',
      data: {
        faceEmbeddingsCount: req.user.faceEmbeddings.length,
        profileImage: req.user.profileImage,
        faceRecognitionEnabled: req.user.faceRecognitionEnabled
      }
    });
  } catch (error) {
    console.error('Face registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Face registration failed'
    });
  }
});

// @route   DELETE /api/auth/remove-face
// @desc    Remove face embedding for user
// @access  Private
router.delete('/remove-face/:embeddingId', auth, async (req, res) => {
  try {
    const { embeddingId } = req.params;
    
    // Remove face embedding
    req.user.faceEmbeddings = req.user.faceEmbeddings.filter(
      embedding => embedding._id.toString() !== embeddingId
    );

    await req.user.save();

    res.json({
      success: true,
      message: 'Face embedding removed successfully',
      data: {
        faceEmbeddingsCount: req.user.faceEmbeddings.length
      }
    });
  } catch (error) {
    console.error('Remove face error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove face embedding'
    });
  }
});

// @route   POST /api/auth/toggle-face-recognition
// @desc    Toggle face recognition for user
// @access  Private
router.post('/toggle-face-recognition', auth, async (req, res) => {
  try {
    req.user.faceRecognitionEnabled = !req.user.faceRecognitionEnabled;
    await req.user.save();

    res.json({
      success: true,
      message: `Face recognition ${req.user.faceRecognitionEnabled ? 'enabled' : 'disabled'}`,
      data: {
        faceRecognitionEnabled: req.user.faceRecognitionEnabled
      }
    });
  } catch (error) {
    console.error('Toggle face recognition error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle face recognition'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          phone: req.user.phone,
          isVerified: req.user.isVerified,
          faceRecognitionEnabled: req.user.faceRecognitionEnabled,
          hasFaceEmbeddings: req.user.faceEmbeddings && req.user.faceEmbeddings.length > 0,
          faceEmbeddingsCount: req.user.faceEmbeddings ? req.user.faceEmbeddings.length : 0,
          profileImage: req.user.profileImage,
          lastLogin: req.user.lastLogin,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', auth, async (req, res) => {
  try {
    const token = generateToken(req.user._id);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: { token }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

module.exports = router; 