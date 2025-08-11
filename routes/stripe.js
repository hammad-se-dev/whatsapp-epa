import express from 'express';
import Stripe from 'stripe';
import twilio from 'twilio';
import { Job, Application, User } from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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
    
    console.log(`💰 Processing payment success for: ${paymentIntentId}`);
    console.log(`📋 Metadata:`, metadata);
    
    if (metadata.type === 'job_application') {
      // Handle job application payment
      const application = await Application.findOne({ paymentIntentId })
        .populate('jobId', 'title companyName')
        .populate('userId', 'whatsappNumber');
      
      if (application) {
        console.log(`✅ Found application: ${application._id}`);
        console.log(`   Job: ${application.jobId.title}`);
        console.log(`   Applicant: ${application.applicantWhatsapp}`);
        console.log(`   Current status: ${application.paymentStatus}`);
        
        application.paymentStatus = 'completed';
        application.paymentDate = new Date();
        await application.save();
        
        console.log(`✅ Updated application payment status to: ${application.paymentStatus}`);
        
        // Update user state
        await User.findByIdAndUpdate(application.userId._id, {
          conversationState: 'completed'
        });
        
        // Send confirmation message to applicant
        await sendWhatsAppMessage(
          application.userId.whatsappNumber,
          `🎉 *Payment Successful!* ✅\n\n` +
          `Your application for *${application.jobId.title}* at ${application.jobId.companyName} has been submitted!\n\n` +
          `📋 Application ID: ${application._id}\n` +
          `💰 Paid: $5.00\n` +
          `📅 Date: ${new Date().toLocaleDateString()}\n\n` +
          `The employer will review your application and contact you directly if you're a good fit.\n\n` +
          `Type *"status"* to check your applications or *"jobs"* to find more opportunities!`
        );
        
        console.log(`Application payment completed: ${application._id}`);
      }
    }
    
    if (metadata.type === 'job_posting') {
      // Handle job posting payment
      const job = await Job.findOne({ paymentIntentId })
        .populate('employerId', 'whatsappNumber companyName');
      
      if (job) {
        job.paymentStatus = 'completed';
        await job.save();
        
        // Update employer state
        await User.findByIdAndUpdate(job.employerId._id, {
          conversationState: 'completed'
        });
        
        // Send confirmation message to employer
        await sendWhatsAppMessage(
          job.employerId.whatsappNumber,
          `🎉 *Payment Successful!* ✅\n\n` +
          `Your job posting for *${job.title}* has been submitted for review!\n\n` +
          `📋 Job ID: ${job._id}\n` +
          `💰 Paid: $20.00\n` +
          `📅 Date: ${new Date().toLocaleDateString()}\n\n` +
          `⏳ Our team will review your job posting within 24 hours. Once approved, it will be visible to job seekers.\n\n` +
          `You'll receive another message when your job goes live!\n\n` +
          `Type *"status"* to check your job posts or *"post job"* to create another listing.`
        );
        
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
      const application = await Application.findOneAndUpdate(
        { paymentIntentId },
        { paymentStatus: 'failed' }
      ).populate('userId', 'whatsappNumber')
       .populate('jobId', 'title');
      
      if (application) {
        // Send failure message to applicant
        await sendWhatsAppMessage(
          application.userId.whatsappNumber,
          `❌ *Payment Failed*\n\n` +
          `Your payment for the application to *${application.jobId.title}* could not be processed.\n\n` +
          `Please try again or contact support if you continue to have issues.\n\n` +
          `Type *"jobs"* to try applying again.`
        );
      }
    }
    
    if (metadata.type === 'job_posting') {
      const job = await Job.findOneAndUpdate(
        { paymentIntentId },
        { paymentStatus: 'failed' }
      ).populate('employerId', 'whatsappNumber');
      
      if (job) {
        // Send failure message to employer
        await sendWhatsAppMessage(
          job.employerId.whatsappNumber,
          `❌ *Payment Failed*\n\n` +
          `Your payment for posting *${job.title}* could not be processed.\n\n` +
          `Please try again or contact support if you continue to have issues.\n\n` +
          `Type *"post job"* to try again.`
        );
      }
    }
    
    console.log(`Payment failed for: ${paymentIntentId}`);
  } catch (error) {
    console.error('Payment failure handler error:', error);
  }
}

// Create payment intent for job application
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { jobId, userId, amount = 500 } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        type: 'job_application',
        jobId,
        userId
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
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

// Create payment intent for job posting
router.post('/create-job-payment-intent', async (req, res) => {
  try {
    const { userId, amount = 2000 } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        type: 'job_posting',
        userId
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Job payment intent creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to send WhatsApp messages
async function sendWhatsAppMessage(whatsappNumber, message) {
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${whatsappNumber}`
    });
    console.log(`WhatsApp message sent to ${whatsappNumber}`);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

// Endpoint to notify employers when their job is approved
router.post('/notify-job-approved', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    const job = await Job.findById(jobId)
      .populate('employerId', 'whatsappNumber');
    
    if (!job || !job.employerId) {
      return res.status(404).json({ error: 'Job or employer not found' });
    }
    
    await sendWhatsAppMessage(
      job.employerId.whatsappNumber,
      `🎉 *Job Approved!* ✅\n\n` +
      `Great news! Your job posting for *${job.title}* has been approved and is now live!\n\n` +
      `Job seekers can now see and apply for your position. You'll receive applications directly via WhatsApp and email.\n\n` +
      `📊 Check your job performance:\n` +
      `• Type *"status"* to see application updates\n` +
      `• Type *"post job"* to create another listing\n\n` +
      `Good luck with your hiring! 🚀`
    );
    
    res.json({ message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending approval notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to notify employers when their job is rejected
router.post('/notify-job-rejected', async (req, res) => {
  try {
    const { jobId, reason } = req.body;
    
    const job = await Job.findById(jobId)
      .populate('employerId', 'whatsappNumber');
    
    if (!job || !job.employerId) {
      return res.status(404).json({ error: 'Job or employer not found' });
    }
    
    await sendWhatsAppMessage(
      job.employerId.whatsappNumber,
      `❌ *Job Posting Rejected*\n\n` +
      `Unfortunately, your job posting for *${job.title}* could not be approved.\n\n` +
      `${reason ? `Reason: ${reason}\n\n` : ''}` +
      `Please review our posting guidelines and try again:\n` +
      `• Job descriptions must be professional and detailed\n` +
      `• No discriminatory language\n` +
      `• Valid contact information required\n` +
      `• Salary range must be realistic\n\n` +
      `Your payment will be refunded within 3-5 business days.\n\n` +
      `Type *"post job"* to create a new listing.`
    );
    
    res.json({ message: 'Rejection notification sent successfully' });
  } catch (error) {
    console.error('Error sending rejection notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new route for direct payment processing
router.get('/direct-pay', async (req, res) => {
  try {
    const { pi: paymentIntentId, type, amount } = req.query;
    
    if (!paymentIntentId || !type) {
      return res.status(400).json({ error: 'Missing payment intent ID or type' });
    }
    
    console.log(`💳 Processing direct payment: ${paymentIntentId}, type: ${type}`);
    
    // Get the payment intent to check its status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      console.log(`✅ Direct payment succeeded: ${paymentIntentId}`);
      
      // Update database based on type
      if (type === 'job_posting') {
        console.log(`🔍 Looking for job with paymentIntentId: ${paymentIntentId}`);
        
        const job = await Job.findOne({ paymentIntentId })
          .populate('employerId', 'whatsappNumber companyName');
        
        console.log(`🔍 Job found:`, job ? `Yes - ${job.title}` : 'No');
        
        if (job) {
          console.log(`📝 Updating job payment status from ${job.paymentStatus} to completed`);
          job.paymentStatus = 'completed';
          await job.save();
          console.log(`✅ Job payment status updated successfully`);
          
          await User.findByIdAndUpdate(job.employerId._id, {
            conversationState: 'completed'
          });
          
          return res.json({
            success: true,
            message: ` Payment successful! Your job posting "${job.title}" has been submitted for review.`,
            jobId: job._id,
            paymentStatus: 'completed'
          });
        } else {
          console.log(`❌ No job found with paymentIntentId: ${paymentIntentId}`);
          return res.status(404).json({
            error: 'Job not found with this payment intent'
          });
        }
      }
      
      if (type === 'job_application') {
        const application = await Application.findOne({ paymentIntentId })
          .populate('jobId', 'title companyName')
          .populate('userId', 'whatsappNumber');
        
        if (application) {
          application.paymentStatus = 'completed';
          application.paymentDate = new Date();
          await application.save();
          
          await User.findByIdAndUpdate(application.userId._id, {
            conversationState: 'completed'
          });
          
          return res.json({
            success: true,
            message: ` Payment successful! Your application for "${application.jobId.title}" has been submitted.`,
            applicationId: application._id,
            paymentStatus: 'completed'
          });
        }
      }
      
      return res.json({
        success: true,
        message: 'Payment processed successfully!'
      });
    } else {
      return res.status(400).json({
        error: `Payment failed with status: ${paymentIntent.status}`
      });
    }
  } catch (error) {
    console.error('Direct payment error:', error);
    return res.status(500).json({
      error: `Payment processing failed: ${error.message}`
    });
  }
});

// Test endpoint to check jobs in database
router.get('/test-jobs', async (req, res) => {
  try {
    const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(10);
    res.json({
      success: true,
      jobs: jobs.map(job => ({
        id: job._id,
        title: job.title,
        companyName: job.companyName,
        status: job.status,
        paymentStatus: job.paymentStatus,
        paymentIntentId: job.paymentIntentId,
        createdAt: job.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching test jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual webhook trigger for testing (remove in production)
router.post('/test-webhook/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status === 'succeeded') {
      await handlePaymentSuccess(paymentIntent);
      res.json({ message: 'Webhook processed successfully', paymentIntent });
    } else {
      res.status(400).json({ error: 'Payment not succeeded', status: paymentIntent.status });
    }
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 