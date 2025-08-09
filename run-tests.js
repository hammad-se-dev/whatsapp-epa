#!/usr/bin/env node

// Quick test runner for WhatsApp Job Portal
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, Job, Application } from './models/index.js';
import { processMessage } from './routes/whatsapp.js';

dotenv.config();

// Test user numbers
const EMPLOYER_NUMBER = 'test_employer_123';
const EMPLOYEE_NUMBER = 'test_employee_456';

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function simulatePayment(paymentIntentId) {
  try {
    // Find application first
    let application = await Application.findOne({ paymentIntentId });
    if (application) {
      application.paymentStatus = 'completed';
      application.paymentDate = new Date();
      await application.save();
      
      await User.findByIdAndUpdate(application.userId, {
        conversationState: 'completed'
      });
      
      console.log('✅ Application payment simulated successfully');
      return true;
    }
    
    // Find job if not application
    let job = await Job.findOne({ paymentIntentId });
    if (job) {
      job.paymentStatus = 'completed';
      await job.save();
      
      await User.findByIdAndUpdate(job.employerId, {
        conversationState: 'completed'
      });
      
      console.log('✅ Job posting payment simulated successfully');
      return true;
    }
    
    console.log('❌ Payment intent not found');
    return false;
  } catch (error) {
    console.error('❌ Payment simulation failed:', error);
    return false;
  }
}

async function testJobPosting() {
  console.log('\n🧪 TESTING JOB POSTING FLOW...');
  
  try {
    // Clean up previous test data
    await User.deleteOne({ whatsappNumber: EMPLOYER_NUMBER });
    
    let user = new User({ whatsappNumber: EMPLOYER_NUMBER });
    await user.save();
    
    const messages = [
      'post job',
      'Senior Full Stack Developer',
      'We are seeking a talented Full Stack Developer to join our growing team. You will work on cutting-edge web applications using React, Node.js, and MongoDB. The ideal candidate has 3+ years of experience and is passionate about creating exceptional user experiences.',
      '1', // Tech category
      '$80,000 - $100,000 per year',
      'New York, NY (Remote friendly)',
      '1', // Full-time
      '3-5 years required',
      'React, Node.js, MongoDB, JavaScript, TypeScript',
      'Awesome Tech Company',
      'jobs@awesometech.com',
      'post'
    ];
    
    for (let i = 0; i < messages.length; i++) {
      console.log(`📝 Step ${i + 1}: "${messages[i]}"`);
      
      // Refresh user from DB
      user = await User.findOne({ whatsappNumber: EMPLOYER_NUMBER });
      const response = await processMessage(user, messages[i]);
      
      console.log(`🤖 Response: ${response.substring(0, 100)}...`);
      
      // Check for payment link
      if (response.includes('payment?pi=')) {
        const match = response.match(/pi=([^&\s]+)/);
        if (match) {
          const paymentIntentId = match[1];
          console.log(`💳 Payment Intent: ${paymentIntentId}`);
          
          // Simulate payment
          const paymentSuccess = await simulatePayment(paymentIntentId);
          if (paymentSuccess) {
            console.log('🎉 Payment completed successfully!');
          }
        }
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Verify job was created
    const jobs = await Job.find({ employerId: user._id }).sort({ createdAt: -1 }).limit(1);
    if (jobs.length > 0) {
      const job = jobs[0];
      console.log(`✅ Job created: "${job.title}" - Status: ${job.status}, Payment: ${job.paymentStatus}`);
      return job;
    } else {
      console.log('❌ No job found in database');
      return null;
    }
    
  } catch (error) {
    console.error('❌ Job posting test failed:', error);
    return null;
  }
}

async function testJobApplication(jobId) {
  if (!jobId) {
    console.log('❌ No job ID provided for application test');
    return false;
  }
  
  console.log('\n🧪 TESTING JOB APPLICATION FLOW...');
  
  try {
    // Clean up previous test data
    await User.deleteOne({ whatsappNumber: EMPLOYEE_NUMBER });
    
    let user = new User({ whatsappNumber: EMPLOYEE_NUMBER });
    await user.save();
    
    const messages = [
      'jobs',
      '1', // Select tech category
      '1', // Select first job
      'apply'
    ];
    
    for (let i = 0; i < messages.length; i++) {
      console.log(`📝 Step ${i + 1}: "${messages[i]}"`);
      
      // Refresh user from DB
      user = await User.findOne({ whatsappNumber: EMPLOYEE_NUMBER });
      const response = await processMessage(user, messages[i]);
      
      console.log(`🤖 Response: ${response.substring(0, 100)}...`);
      
      // Check for payment link
      if (response.includes('payment?pi=')) {
        const match = response.match(/pi=([^&\s]+)/);
        if (match) {
          const paymentIntentId = match[1];
          console.log(`💳 Payment Intent: ${paymentIntentId}`);
          
          // Simulate payment
          const paymentSuccess = await simulatePayment(paymentIntentId);
          if (paymentSuccess) {
            console.log('🎉 Payment completed successfully!');
          }
        }
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Verify application was created
    const applications = await Application.find({ userId: user._id }).sort({ createdAt: -1 }).limit(1);
    if (applications.length > 0) {
      const app = applications[0];
      console.log(`✅ Application created: Job ${app.jobId} - Status: ${app.applicationStatus}, Payment: ${app.paymentStatus}`);
      return true;
    } else {
      console.log('❌ No application found in database');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Job application test failed:', error);
    return false;
  }
}

async function showResults() {
  console.log('\n📊 FINAL RESULTS:');
  
  const jobs = await Job.find().sort({ createdAt: -1 }).limit(3);
  console.log(`\n📋 Recent Jobs (${jobs.length}):`);
  jobs.forEach((job, i) => {
    console.log(`${i + 1}. ${job.title} - ${job.companyName} [${job.status}] [Payment: ${job.paymentStatus}]`);
  });
  
  const applications = await Application.find().populate('jobId', 'title').sort({ createdAt: -1 }).limit(3);
  console.log(`\n📝 Recent Applications (${applications.length}):`);
  applications.forEach((app, i) => {
    console.log(`${i + 1}. ${app.jobId?.title || 'Unknown Job'} [${app.applicationStatus}] [Payment: ${app.paymentStatus}]`);
  });
  
  const users = await User.find({ whatsappNumber: { $in: [EMPLOYER_NUMBER, EMPLOYEE_NUMBER] } });
  console.log(`\n👥 Test Users (${users.length}):`);
  users.forEach((user, i) => {
    console.log(`${i + 1}. ${user.whatsappNumber} [${user.role || 'no role'}] [${user.conversationState}]`);
  });
}

async function runTests() {
  console.log('🚀 WHATSAPP JOB PORTAL - AUTOMATED TEST SUITE');
  console.log('===========================================\n');
  
  await connectDB();
  
  // Test job posting
  const createdJob = await testJobPosting();
  
  // Test job application (if job was created)
  if (createdJob) {
    // Approve the job first so it shows up in search
    createdJob.status = 'live';
    await createdJob.save();
    console.log('✅ Job approved for testing');
    
    await testJobApplication(createdJob._id);
  }
  
  await showResults();
  
  console.log('\n✅ Tests completed! Check the results above.');
  console.log('💡 Run "node terminal-test.js" for interactive testing.');
  
  mongoose.connection.close();
}

// Run tests
runTests().catch(console.error);
