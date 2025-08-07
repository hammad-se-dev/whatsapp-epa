import express from 'express';
import Stripe from 'stripe';
import { Job, Application, User } from '../models/index.js';
import dotenv from 'dotenv';


dotenv.config(); // Make sure you load env variables

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe webhook endpoint
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object);
      break;
      
    case 'payment_intent.payment_failed':
      await handlePaymentFailure(event.data.object);
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

async function handlePaymentSuccess(paymentIntent) {
  try {
    const { id: paymentIntentId, metadata } = paymentIntent;
    
    if (metadata.type === 'job_application') {
      // Handle job application payment
      const application = await Application.findOne({ paymentIntentId });
      if (application) {
        application.paymentStatus = 'completed';
        application.paymentDate = new Date();
        await application.save();
        
        // Update user state
        await User.findByIdAndUpdate(application.userId, {
          conversationState: 'completed'
        });
        
        console.log(`Application payment completed: ${application._id}`);
      }
    }
    
    if (metadata.type === 'job_posting') {
      // Handle job posting payment
      const job = await Job.findOne({ paymentIntentId });
      if (job) {
        job.paymentStatus = 'completed';
        await job.save();
        
        // Update employer state
        await User.findByIdAndUpdate(job.employerId, {
          conversationState: 'completed'
        });
        
        console.log(`Job posting payment completed: ${job._id}`);
      }
    }
  } catch (error) {
    console.error('Payment success handler error:', error);
  }
}

async function handlePaymentFailure(paymentIntent) {
  try {
    const { id: paymentIntentId, metadata } = paymentIntent;
    
    if (metadata.type === 'job_application') {
      await Application.findOneAndUpdate(
        { paymentIntentId },
        { paymentStatus: 'failed' }
      );
    }
    
    if (metadata.type === 'job_posting') {
      await Job.findOneAndUpdate(
        { paymentIntentId },
        { paymentStatus: 'failed' }
      );
    }
    
    console.log(`Payment failed for: ${paymentIntentId}`);
  } catch (error) {
    console.error('Payment failure handler error:', error);
  }
}

// Create payment intent for job application
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { jobId, userId, amount = 500 } = req.body; // $5.00 in cents
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        type: 'job_application',
        jobId,
        userId
      }
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;