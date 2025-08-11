// terminal-test.js - Enhanced WhatsApp Bot Tester with Stripe Integration
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import Stripe from 'stripe';
import { User, Job, Application } from './models/index.js';
import { processMessage } from './routes/whatsapp.js';

dotenv.config();

// --- CONFIGURATION ---
const TEST_USER_NUMBER = 'terminal_user_123';
const EMPLOYER_TEST_NUMBER = 'terminal_employer_456';
const EMPLOYEE_TEST_NUMBER = 'terminal_employee_789';
// --------------------

// Initialize Stripe (if keys are available)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('✅ Stripe initialized for payment testing');
} else {
  console.log('⚠️  No Stripe key found - payment simulation mode only');
}

// Create an interface to read from the command line
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Current active user for testing
let currentTestUser = TEST_USER_NUMBER;

// Real payment processing function
async function processRealPayment(paymentIntentId, metadata) {
  try {
    console.log(`\n💳 PROCESSING REAL PAYMENT for ${paymentIntentId}`);
    
    if (!stripe) {
      throw new Error('Stripe not initialized - check your STRIPE_SECRET_KEY');
    }
    
    // Confirm the payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa', // Use test card
    });
    
    if (paymentIntent.status === 'succeeded') {
      console.log(`✅ Real payment confirmed with Stripe: ${paymentIntentId}`);
      
      if (metadata.type === 'job_application') {
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
          
          console.log(`✅ Application payment completed for job: ${application.jobId.title}`);
          return `🎉 *Real Payment Successful!* ✅\n\nYour application for *${application.jobId.title}* at ${application.jobId.companyName} has been submitted!\n\n📋 Application ID: ${application._id}\n💰 Paid: $5.00\n📅 Date: ${new Date().toLocaleDateString()}\n\nThe employer will review your application and contact you directly if you're a good fit.\n\nType *"status"* to check your applications or *"jobs"* to find more opportunities!`;
        }
      }
      
      if (metadata.type === 'job_posting') {
        const job = await Job.findOne({ paymentIntentId })
          .populate('employerId', 'whatsappNumber companyName');
        
        if (job) {
          job.paymentStatus = 'completed';
          await job.save();
          
          await User.findByIdAndUpdate(job.employerId._id, {
            conversationState: 'completed'
          });
          
          console.log(`✅ Job posting payment completed for: ${job.title}`);
          return `🎉 *Real Payment Successful!* ✅\n\nYour job posting for *${job.title}* has been submitted for review!\n\n📋 Job ID: ${job._id}\n💰 Paid: $20.00\n📅 Date: ${new Date().toLocaleDateString()}\n\n⏳ Our team will review your job posting within 24 hours. Once approved, it will be visible to job seekers.\n\nYou'll receive another message when your job goes live!\n\nType *"status"* to check your job posts or *"post job"* to create another listing.`;
        }
      }
      
      return 'Real payment processed but no matching record found.';
    } else {
      throw new Error(`Payment failed with status: ${paymentIntent.status}`);
    }
  } catch (error) {
    console.error('Real payment processing error:', error);
    return `❌ Real payment failed: ${error.message}`;
  }
}

// Payment simulation functions (keep for backward compatibility)
async function simulatePaymentSuccess(paymentIntentId, metadata) {
  try {
    console.log(`\n💳 SIMULATING PAYMENT SUCCESS for ${paymentIntentId}`);
    
    if (metadata.type === 'job_application') {
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
        
        console.log(`✅ Application payment completed for job: ${application.jobId.title}`);
        return `🎉 *Payment Successful!* ✅\n\nYour application for *${application.jobId.title}* at ${application.jobId.companyName} has been submitted!\n\n📋 Application ID: ${application._id}\n💰 Paid: $5.00\n📅 Date: ${new Date().toLocaleDateString()}\n\nThe employer will review your application and contact you directly if you're a good fit.\n\nType *"status"* to check your applications or *"jobs"* to find more opportunities!`;
      }
    }
    
    if (metadata.type === 'job_posting') {
      const job = await Job.findOne({ paymentIntentId })
        .populate('employerId', 'whatsappNumber companyName');
      
      if (job) {
        job.paymentStatus = 'completed';
        await job.save();
        
        await User.findByIdAndUpdate(job.employerId._id, {
          conversationState: 'completed'
        });
        
        console.log(`✅ Job posting payment completed for: ${job.title}`);
        return `🎉 *Payment Successful!* ✅\n\nYour job posting for *${job.title}* has been submitted for review!\n\n📋 Job ID: ${job._id}\n💰 Paid: $20.00\n📅 Date: ${new Date().toLocaleDateString()}\n\n⏳ Our team will review your job posting within 24 hours. Once approved, it will be visible to job seekers.\n\nYou'll receive another message when your job goes live!\n\nType *"status"* to check your job posts or *"post job"* to create another listing.`;
      }
    }
    
    return 'Payment processed but no matching record found.';
  } catch (error) {
    console.error('Payment simulation error:', error);
    return 'Error simulating payment.';
  }
}

async function handleSpecialCommands(input) {
  // Switch user commands
  if (input.startsWith('/user ')) {
    const userType = input.split(' ')[1];
    switch (userType) {
      case 'employer':
        currentTestUser = EMPLOYER_TEST_NUMBER;
        console.log(`👤 Switched to EMPLOYER test user: ${currentTestUser}`);
        return true;
      case 'employee':
        currentTestUser = EMPLOYEE_TEST_NUMBER;
        console.log(`👤 Switched to EMPLOYEE test user: ${currentTestUser}`);
        return true;
      case 'default':
        currentTestUser = TEST_USER_NUMBER;
        console.log(`👤 Switched to DEFAULT test user: ${currentTestUser}`);
        return true;
      default:
        console.log(`❌ Invalid user type. Use: /user employer|employee|default`);
        return true;
    }
  }
  
  // Real payment processing commands
  if (input.startsWith('/realpay ')) {
    const paymentId = input.split(' ')[1];
    if (!paymentId) {
      console.log('❌ Usage: /realpay <payment_intent_id>');
      return true;
    }
    
    // Find the payment intent in our database
    let record = await Application.findOne({ paymentIntentId: paymentId });
    let metadata = { type: 'job_application' };
    
    if (!record) {
      record = await Job.findOne({ paymentIntentId: paymentId });
      metadata = { type: 'job_posting' };
    }
    
    if (!record) {
      console.log('❌ Payment intent not found in database');
      return true;
    }
    
    const result = await processRealPayment(paymentId, metadata);
    console.log(`\n💰 REAL PAYMENT RESULT:\n${result}\n`);
    return true;
  }
  
  // Payment simulation commands (keep for backward compatibility)
  if (input.startsWith('/pay ')) {
    const paymentId = input.split(' ')[1];
    if (!paymentId) {
      console.log('❌ Usage: /pay <payment_intent_id>');
      return true;
    }
    
    // Find the payment intent in our database
    let record = await Application.findOne({ paymentIntentId: paymentId });
    let metadata = { type: 'job_application' };
    
    if (!record) {
      record = await Job.findOne({ paymentIntentId: paymentId });
      metadata = { type: 'job_posting' };
    }
    
    if (!record) {
      console.log('❌ Payment intent not found in database');
      return true;
    }
    
    const result = await simulatePaymentSuccess(paymentId, metadata);
    console.log(`\n💰 PAYMENT RESULT:\n${result}\n`);
    return true;
  }
  
  // Database query commands
  if (input === '/jobs') {
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(5);
    console.log(`\n📋 Recent Jobs (${jobs.length}):`);
    jobs.forEach((job, i) => {
      console.log(`${i+1}. ${job.title} - ${job.companyName} [${job.status}] [Payment: ${job.paymentStatus}]`);
    });
    console.log('');
    return true;
  }
  
  if (input === '/applications') {
    const apps = await Application.find().populate('jobId', 'title').sort({ createdAt: -1 }).limit(5);
    console.log(`\n📝 Recent Applications (${apps.length}):`);
    apps.forEach((app, i) => {
      console.log(`${i+1}. ${app.jobId?.title || 'Unknown Job'} [${app.applicationStatus}] [Payment: ${app.paymentStatus}]`);
    });
    console.log('');
    return true;
  }
  
  if (input === '/users') {
    const users = await User.find();
    console.log(`\n👥 Test Users (${users.length}):`);
    users.forEach((user, i) => {
      const indicator = user.whatsappNumber === currentTestUser ? '👈 CURRENT' : '';
      console.log(`${i+1}. ${user.whatsappNumber} [${user.role || 'no role'}] [${user.conversationState}] ${indicator}`);
    });
    console.log('');
    return true;
  }
  
  if (input === '/help') {
    console.log(`
🚀 ENHANCED TERMINAL TEST COMMANDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 USER MANAGEMENT:
/user employer     - Switch to employer test user
/user employee     - Switch to employee test user  
/user default      - Switch to default test user

�� PAYMENT TESTING:
/realpay <payment_id>  - Process REAL Stripe payment
/pay <payment_id>      - Simulate successful payment

📊 DATABASE QUERIES:
/jobs              - Show recent jobs
/applications      - Show recent applications
/users             - Show all test users

🔧 OTHER:
/help              - Show this help
exit               - Quit the application

💡 TIP: Use /realpay for actual Stripe payments, /pay for simulation!
`);
    return true;
  }
  
  return false; // Not a special command
}

// Function to connect to the database
async function connectToDB() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ ERROR: MONGODB_URI is not defined in your .env file.');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Successfully connected to MongoDB.');
  } catch (error) {
    console.error('❌ Could not connect to MongoDB.', error);
    process.exit(1);
  }
}

// The main chat loop function
async function chatLoop() {
  const userIndicator = currentTestUser === EMPLOYER_TEST_NUMBER ? '👔 EMPLOYER' : 
                       currentTestUser === EMPLOYEE_TEST_NUMBER ? '👤 EMPLOYEE' : 
                       '👤 DEFAULT';
  
  rl.question(`${userIndicator}: `, async (input) => {
    // Exit condition
    if (input.toLowerCase() === 'exit') {
      console.log('👋 Goodbye!');
      rl.close();
      mongoose.connection.close();
      return;
    }

    try {
      // Handle special commands first
      const wasSpecialCommand = await handleSpecialCommands(input);
      if (wasSpecialCommand) {
        chatLoop();
        return;
      }

      // Find or create the current test user
      let user = await User.findOne({ whatsappNumber: currentTestUser });
      if (!user) {
        console.log(`✨ Creating new test user: ${currentTestUser}`);
        user = new User({ whatsappNumber: currentTestUser });
        await user.save();
      }

      // Process the message using the current user
      const response = await processMessage(user, input);
      
      // Check if response contains a payment link
      if (response.includes('payment?pi=')) {
        const paymentMatch = response.match(/pi=([^&\s]+)/);
        if (paymentMatch) {
          const fullPaymentId = paymentMatch[1];
          // Extract just the payment intent ID (before _secret_)
          const paymentIntentId = fullPaymentId.split('_secret_')[0];
          
          console.log(`\n🤖 BOT: ${response}\n`);
          console.log(`💡 TIP: For REAL payment, use: /realpay ${paymentIntentId}\n`);
          console.log(`💡 TIP: For simulation, use: /pay ${paymentIntentId}\n`);
        } else {
          console.log(`\n🤖 BOT: ${response}\n`);
        }
      } else {
        console.log(`\n🤖 BOT: ${response}\n`);
      }

    } catch (error) {
      console.error('🔥 An error occurred:', error);
    }
    
    // Continue the loop
    chatLoop();
  });
}

// Start the application
async function start() {
  await connectToDB();
  console.log('🚀 === ENHANCED WHATSAPP BOT TERMINAL TESTER ===');
  console.log('💡 Features: Stripe Payment Testing + Database Integration');
  console.log('📱 Type "/help" for commands or start chatting normally');
  console.log('⚡ Type "exit" to quit');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Show initial help
  console.log('🔧 Quick Start:');
  console.log('• Type "post job" to test job posting with payment');
  console.log('• Type "jobs" to test job application with payment');
  console.log('• Use "/user employer" or "/user employee" to switch users');
  console.log('• Use "/pay <payment_id>" to simulate successful payments\n');
  
  chatLoop();
}

start();