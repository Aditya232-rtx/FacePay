const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const paymentService = require('../services/paymentService');
const faceRecognitionService = require('../services/faceRecognition');
const { auth, requireVerified, requireFaceRecognition } = require('../middleware/auth');

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

// Validation middleware
const validatePayment = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('currency').isIn(['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy']).withMessage('Invalid currency'),
  body('description').trim().isLength({ min: 1, max: 500 }).withMessage('Description is required and must be less than 500 characters')
];

// @route   POST /api/payments/face-payment
// @desc    Process payment using face recognition
// @access  Private
router.post('/face-payment', 
  auth, 
  requireVerified, 
  requireFaceRecognition, 
  upload.single('faceImage'),
  validatePayment,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Face image is required for payment verification'
        });
      }

      const { amount, currency, description, paymentMethod = 'card' } = req.body;

      // Verify face against user's stored embeddings
      const faceData = await faceRecognitionService.generateEmbedding(req.file.buffer);
      const bestMatch = await faceRecognitionService.findBestMatch(
        faceData.embedding, 
        req.user.faceEmbeddings
      );

      if (!bestMatch) {
        return res.status(401).json({
          success: false,
          message: 'Face verification failed. Payment cannot be processed.'
        });
      }

      // Save payment image
      const filename = `payment_${req.user._id}_${Date.now()}.jpg`;
      const imageUrl = await faceRecognitionService.saveImage(req.file.buffer, filename);

      // Process payment
      const paymentResult = await paymentService.processFacePayment(
        req.user._id,
        parseFloat(amount),
        currency,
        description,
        {
          confidence: faceData.confidence,
          embeddingDistance: bestMatch.distance,
          threshold: faceRecognitionService.threshold,
          imageUrl,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        },
        paymentMethod
      );

      res.json({
        success: true,
        message: 'Payment initiated successfully',
        data: {
          paymentIntent: {
            id: paymentResult.paymentIntent.id,
            clientSecret: paymentResult.paymentIntent.client_secret,
            amount: paymentResult.paymentIntent.amount,
            currency: paymentResult.paymentIntent.currency,
            status: paymentResult.paymentIntent.status
          },
          payment: {
            id: paymentResult.payment._id,
            amount: paymentResult.payment.amount,
            currency: paymentResult.payment.currency,
            status: paymentResult.payment.status,
            description: paymentResult.payment.description
          },
          faceVerification: {
            confidence: faceData.confidence,
            similarity: bestMatch.similarity,
            distance: bestMatch.distance,
            verified: true
          }
        }
      });
    } catch (error) {
      console.error('Face payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Payment processing failed'
      });
    }
  }
);

// @route   POST /api/payments/confirm
// @desc    Confirm payment with payment method
// @access  Private
router.post('/confirm', auth, async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment Intent ID is required'
      });
    }

    const result = await paymentService.confirmPayment(paymentIntentId, paymentMethodId);

    res.json({
      success: true,
      message: 'Payment confirmed',
      data: {
        payment: {
          id: result.payment._id,
          status: result.payment.status,
          amount: result.payment.amount,
          currency: result.payment.currency
        },
        paymentIntent: {
          id: result.paymentIntent.id,
          status: result.paymentIntent.status
        }
      }
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Payment confirmation failed'
    });
  }
});

// @route   GET /api/payments/history
// @desc    Get user's payment history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const result = await paymentService.getPaymentHistory(
      req.user._id, 
      parseInt(limit), 
      parseInt(offset)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment history'
    });
  }
});

// @route   GET /api/payments/stats
// @desc    Get payment statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const stats = await paymentService.getPaymentStats(req.user._id, period);

    res.json({
      success: true,
      data: {
        ...stats,
        period,
        formattedTotal: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(stats.totalAmount / 100)
      }
    });
  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment statistics'
    });
  }
});

// @route   POST /api/payments/refund/:paymentId
// @desc    Refund a payment
// @access  Private
router.post('/refund/:paymentId', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    const result = await paymentService.refundPayment(paymentId, reason);

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      data: {
        payment: {
          id: result.payment._id,
          status: result.payment.status,
          refundedAt: result.payment.refundedAt
        },
        refund: {
          id: result.refund.id,
          amount: result.refund.amount,
          status: result.refund.status
        }
      }
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Refund failed'
    });
  }
});

// @route   GET /api/payments/methods
// @desc    Get user's payment methods
// @access  Private
router.get('/methods', auth, async (req, res) => {
  try {
    const paymentMethods = await paymentService.getPaymentMethods(req.user._id);

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods'
    });
  }
});

// @route   POST /api/payments/setup-intent
// @desc    Create setup intent for adding payment method
// @access  Private
router.post('/setup-intent', auth, async (req, res) => {
  try {
    const setupIntent = await paymentService.createSetupIntent(req.user._id);

    res.json({
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
        id: setupIntent.id
      }
    });
  } catch (error) {
    console.error('Setup intent error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create setup intent'
    });
  }
});

module.exports = router; 