const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const User = require('../models/User');

class PaymentService {
  constructor() {
    this.stripe = stripe;
  }

  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          ...metadata,
          source: 'facepay',
          timestamp: new Date().toISOString()
        }
      });

      return paymentIntent;
    } catch (error) {
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  async processFacePayment(userId, amount, currency, description, faceData, paymentMethod = 'card') {
    try {
      // Validate user exists and is active
      const user = await User.findById(userId);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Create Stripe customer if not exists
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: user.fullName,
          phone: user.phone,
          metadata: {
            userId: user._id.toString(),
            source: 'facepay'
          }
        });
        
        stripeCustomerId = customer.id;
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }

      // Create payment intent
      const paymentIntent = await this.createPaymentIntent(amount, currency, {
        userId: user._id.toString(),
        description,
        paymentMethod,
        faceConfidence: faceData.confidence.toString(),
        faceDistance: faceData.embeddingDistance.toString()
      });

      // Create payment record
      const payment = new Payment({
        amount: Math.round(amount * 100), // Store in cents
        currency: currency.toLowerCase(),
        userId: user._id,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId,
        faceRecognitionData: {
          confidence: faceData.confidence,
          embeddingDistance: faceData.embeddingDistance,
          threshold: faceData.threshold,
          imageUrl: faceData.imageUrl || null
        },
        paymentMethod,
        description,
        status: 'pending',
        ipAddress: faceData.ipAddress || 'unknown',
        userAgent: faceData.userAgent || 'unknown'
      });

      await payment.save();

      return {
        paymentIntent,
        payment,
        user: {
          id: user._id,
          name: user.fullName,
          email: user.email
        }
      };
    } catch (error) {
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }

  async confirmPayment(paymentIntentId, paymentMethodId = null) {
    try {
      const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
      if (!payment) {
        throw new Error('Payment not found');
      }

      // Confirm payment with Stripe
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId
      });

      // Update payment status
      payment.status = paymentIntent.status;
      if (paymentIntent.status === 'succeeded') {
        payment.processedAt = new Date();
      } else if (paymentIntent.status === 'failed') {
        payment.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
        payment.failureCode = paymentIntent.last_payment_error?.code || 'unknown';
      }

      await payment.save();

      return {
        payment,
        paymentIntent
      };
    } catch (error) {
      throw new Error(`Payment confirmation failed: ${error.message}`);
    }
  }

  async refundPayment(paymentId, reason = 'User requested refund') {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'succeeded') {
        throw new Error('Only successful payments can be refunded');
      }

      // Process refund through Stripe
      const refund = await this.stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          reason,
          refundedBy: 'facepay',
          originalPaymentId: payment._id.toString()
        }
      });

      // Update payment status
      payment.status = 'refunded';
      payment.failureReason = reason;
      payment.refundedAt = new Date();
      await payment.save();

      return {
        payment,
        refund
      };
    } catch (error) {
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  async getPaymentStatus(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent.status;
    } catch (error) {
      throw new Error(`Failed to get payment status: ${error.message}`);
    }
  }

  async getPaymentHistory(userId, limit = 10, offset = 0) {
    try {
      const payments = await Payment.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .populate('userId', 'firstName lastName email profileImage');

      const total = await Payment.countDocuments({ userId });

      return {
        payments,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      throw new Error(`Failed to get payment history: ${error.message}`);
    }
  }

  async getPaymentStats(userId, period = '30d') {
    try {
      return await Payment.getPaymentStats(userId, period);
    } catch (error) {
      throw new Error(`Failed to get payment stats: ${error.message}`);
    }
  }

  async createSetupIntent(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create or get Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: user.fullName,
          phone: user.phone,
          metadata: {
            userId: user._id.toString(),
            source: 'facepay'
          }
        });
        
        stripeCustomerId = customer.id;
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }

      // Create setup intent
      const setupIntent = await this.stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: {
          userId: user._id.toString(),
          purpose: 'facepay_payment_method'
        }
      });

      return setupIntent;
    } catch (error) {
      throw new Error(`Failed to create setup intent: ${error.message}`);
    }
  }

  async attachPaymentMethod(userId, paymentMethodId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.stripeCustomerId) {
        throw new Error('User not found or no Stripe customer');
      }

      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.stripeCustomerId,
      });

      // Set as default payment method
      await this.stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Update user's default payment method
      user.defaultPaymentMethod = paymentMethodId;
      await user.save();

      return { success: true, paymentMethodId };
    } catch (error) {
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

  async getPaymentMethods(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.stripeCustomerId) {
        return [];
      }

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });

      return paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year
        } : null,
        isDefault: pm.id === user.defaultPaymentMethod
      }));
    } catch (error) {
      throw new Error(`Failed to get payment methods: ${error.message}`);
    }
  }

  async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Webhook handling failed:', error);
      throw error;
    }
  }

  async handlePaymentSucceeded(paymentIntent) {
    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });
    
    if (payment) {
      payment.status = 'succeeded';
      payment.processedAt = new Date();
      await payment.save();
    }
  }

  async handlePaymentFailed(paymentIntent) {
    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntent.id 
    });
    
    if (payment) {
      payment.status = 'failed';
      payment.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
      payment.failureCode = paymentIntent.last_payment_error?.code || 'unknown';
      await payment.save();
    }
  }

  async handleChargeRefunded(charge) {
    const payment = await Payment.findOne({ 
      stripePaymentIntentId: charge.payment_intent 
    });
    
    if (payment) {
      payment.status = 'refunded';
      payment.refundedAt = new Date();
      await payment.save();
    }
  }
}

module.exports = new PaymentService(); 