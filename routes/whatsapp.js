import express from 'express';
import twilio from 'twilio';
import Stripe from 'stripe';
import { User, Job, Application } from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Categories mapping
const CATEGORIES = {
  '1': 'Tech',
  '2': 'Marketing',
  '3': 'Sales',
  '4': 'Finance',
  '5': 'HR',
  '6': 'Operations',
  '7': 'Other'
};

const EMPLOYMENT_TYPES = {
  '1': 'Full-time',
  '2': 'Part-time',
  '3': 'Contract',
  '4': 'Freelance'
};

// Webhook to receive WhatsApp messages
router.post('/webhook', async (req, res) => {
  try {
    console.log('Received WhatsApp message:', req.body);
    
    const { Body: message, From: from, To: to } = req.body;
    const whatsappNumber = from.replace('whatsapp:', '');
    
    // Find or create user
    let user = await User.findOne({ whatsappNumber });
    if (!user) {
      user = new User({ whatsappNumber });
      await user.save();
    }
    
    // Process message based on user state
    const response = await processMessage(user, message);
    
    // Send response back to WhatsApp
    if (response) {
      await client.messages.create({
        body: response,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).send('Error processing message');
  }
});

// Main message processing function
async function processMessage(user, message) {
  console.log(`Processing message for user ${user.whatsappNumber}, state: ${user.conversationState}`);
  
  switch (user.conversationState) {
    case 'new_user':
      return handleNewUser(user);
    
    case 'choosing_role':
      return handleRoleSelection(user, message);
    
    case 'employee_choosing_category':
      return handleCategorySelection(user, message);
    
    case 'employee_viewing_jobs':
      return handleJobViewing(user, message);
    
    case 'employee_payment_pending':
      return handleEmployeePaymentCheck(user, message);
    
    case 'employer_entering_details':
      return handleEmployerJobEntry(user, message);
    
    case 'employer_payment_pending':
      return handleEmployerPaymentCheck(user, message);
    
    case 'completed':
      return handleCompletedUser(user, message);
    
    default:
      return "I'm having trouble understanding. Let me restart our conversation.";
  }
}

// =============================================================================
// NEW USER FLOW
// =============================================================================

async function handleNewUser(user) {
  user.conversationState = 'choosing_role';
  await user.save();
  
  return `Welcome to WhatsApp Job Portal! 👋\n\nI can help you with:\n\n1️⃣ Find a Job (Job Seeker)\n2️⃣ Post a Job (Employer)\n\nReply with *1* or *2*`;
}

// =============================================================================
// ROLE SELECTION
// =============================================================================

async function handleRoleSelection(user, message) {
  const choice = message.trim();
  
  if (choice === '1') {
    user.role = 'employee';
    user.conversationState = 'employee_choosing_category';
    await user.save();
    
    return `Great! Let's find you a job! 💼\n\nWhich category interests you?\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other\n\nReply with the number (1-7)`;
  }
  
  if (choice === '2') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    
    return `Perfect! Let's post your job! 📝\n\nStep 1/8: What's the *job title*?\n\nExample: "Senior Software Developer" or "Marketing Manager"`;
  }
  
  return `Please reply with *1* for Job Seeker or *2* for Employer`;
}

// =============================================================================
// EMPLOYEE FLOW
// =============================================================================

async function handleCategorySelection(user, message) {
  const choice = message.trim();
  
  if (!CATEGORIES[choice]) {
    return `Please select a valid category (1-7):\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other`;
  }
  
  const selectedCategory = CATEGORIES[choice];
  user.preferredCategory = selectedCategory;
  user.conversationState = 'employee_viewing_jobs';
  await user.save();
  
  // Find live jobs in the selected category
  const jobs = await Job.find({ 
    category: selectedCategory, 
    status: 'live' 
  }).limit(5).sort({ createdAt: -1 });
  
  if (jobs.length === 0) {
    return `Sorry, no jobs available in ${selectedCategory} right now. 😞\n\nWould you like to:\n\n1️⃣ Choose another category\n2️⃣ Get notified when new ${selectedCategory} jobs are posted\n\nReply with 1 or 2`;
  }
  
  let jobList = `📋 *Available ${selectedCategory} Jobs:*\n\n`;
  
  jobs.forEach((job, index) => {
    jobList += `*${index + 1}. ${job.title}*\n`;
    jobList += `🏢 ${job.companyName}\n`;
    jobList += `💰 ${job.salary}\n`;
    jobList += `📍 ${job.location}\n`;
    jobList += `⏰ ${job.employmentType}\n\n`;
  });
  
  jobList += `To apply for any job, reply with the job number (1-${jobs.length})\n\n`;
  jobList += `💡 *Application fee: $5* (helps us maintain quality and reduce spam)`;
  
  return jobList;
}

async function handleJobViewing(user, message) {
  const choice = parseInt(message.trim());
  
  // Check if user wants to go back to category selection
  if (message.toLowerCase().includes('back') || message === '1') {
    user.conversationState = 'employee_choosing_category';
    await user.save();
    return `Which category interests you?\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other`;
  }
  
  // Get jobs in user's preferred category
  const jobs = await Job.find({ 
    category: user.preferredCategory, 
    status: 'live' 
  }).limit(5).sort({ createdAt: -1 });
  
  if (choice < 1 || choice > jobs.length) {
    return `Please select a valid job number (1-${jobs.length}) or type "back" to choose another category.`;
  }
  
  const selectedJob = jobs[choice - 1];
  
  // Check if user already applied for this job
  const existingApplication = await Application.findOne({
    userId: user._id,
    jobId: selectedJob._id
  });
  
  if (existingApplication) {
    return `You've already applied for this job! ✅\n\nApplication Status: *${existingApplication.applicationStatus}*\nPayment Status: *${existingApplication.paymentStatus}*\n\nType "jobs" to see other opportunities.`;
  }
  
  // Show detailed job info and payment option
  const jobDetails = `📄 *Job Details:*\n\n` +
    `*${selectedJob.title}*\n` +
    `🏢 ${selectedJob.companyName}\n` +
    `💰 ${selectedJob.salary}\n` +
    `📍 ${selectedJob.location}\n` +
    `⏰ ${selectedJob.employmentType}\n` +
    `🎯 Experience: ${selectedJob.experience}\n\n` +
    `*Description:*\n${selectedJob.description}\n\n` +
    `*Required Skills:* ${selectedJob.skills.join(', ')}\n\n` +
    `💳 *Ready to apply? Application fee: $5*\n\n` +
    `Reply *"apply"* to proceed with payment, or *"back"* to see other jobs.`;
  
  // Store the job ID for application
  user.currentJobId = selectedJob._id;
  await user.save();
  
  return jobDetails;
}

async function handleEmployeePaymentCheck(user, message) {
  const msg = message.toLowerCase().trim();
  
  if (msg === 'apply') {
    // Create Stripe payment intent
    try {
      const job = await Job.findById(user.currentJobId);
      if (!job) {
        return `Sorry, this job is no longer available. Type "jobs" to see current openings.`;
      }
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 500, // $5.00 in cents
        currency: 'usd',
        metadata: {
          type: 'job_application',
          jobId: user.currentJobId.toString(),
          userId: user._id.toString()
        }
      });
      
      // Create pending application record
      const application = new Application({
        userId: user._id,
        jobId: user.currentJobId,
        applicantWhatsapp: user.whatsappNumber,
        paymentIntentId: paymentIntent.id,
        paymentAmount: 500
      });
      await application.save();
      
      // Create payment link (you'll need to implement a simple payment page)
      const paymentLink = `${process.env.FRONTEND_URL}/payment?pi=${paymentIntent.client_secret}`;
      
      return `💳 *Payment Required*\n\nClick here to pay your $5 application fee:\n${paymentLink}\n\n✅ After payment, your application will be submitted automatically!\n\n⏰ Payment link expires in 30 minutes.`;
      
    } catch (error) {
      console.error('Payment creation error:', error);
      return `Sorry, there was an error processing your payment. Please try again later or contact support.`;
    }
  }
  
  if (msg === 'back') {
    user.conversationState = 'employee_viewing_jobs';
    await user.save();
    return handleJobViewing(user, ''); // Show jobs list again
  }
  
  return `Please reply *"apply"* to proceed with payment or *"back"* to see other jobs.`;
}

// =============================================================================
// EMPLOYER FLOW
// =============================================================================

async function handleEmployerJobEntry(user, message) {
  const tempData = user.tempJobData || {};
  const step = tempData.step;
  
  switch (step) {
    case 'title':
      tempData.title = message.trim();
      tempData.step = 'description';
      user.tempJobData = tempData;
      await user.save();
      return `Step 2/8: Please provide a *job description*.\n\nInclude responsibilities, requirements, and what makes this role exciting!`;
    
    case 'description':
      tempData.description = message.trim();
      tempData.step = 'category';
      user.tempJobData = tempData;
      await user.save();
      return `Step 3/8: Select the *job category*:\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other\n\nReply with the number (1-7)`;
    
    case 'category':
      const categoryChoice = message.trim();
      if (!CATEGORIES[categoryChoice]) {
        return `Please select a valid category (1-7)`;
      }
      tempData.category = CATEGORIES[categoryChoice];
      tempData.step = 'salary';
      user.tempJobData = tempData;
      await user.save();
      return `Step 4/8: What's the *salary range*?\n\nExample: "$50,000 - $70,000 per year" or "$25/hour"`;
    
    case 'salary':
      tempData.salary = message.trim();
      tempData.step = 'location';
      user.tempJobData = tempData;
      await user.save();
      return `Step 5/8: What's the *job location*?\n\nExample: "New York, NY", "Remote", or "San Francisco, CA (Hybrid)"`;
    
    case 'location':
      tempData.location = message.trim();
      tempData.step = 'employmentType';
      user.tempJobData = tempData;
      await user.save();
      return `Step 6/8: Select *employment type*:\n\n1️⃣ Full-time\n2️⃣ Part-time\n3️⃣ Contract\n4️⃣ Freelance\n\nReply with the number (1-4)`;
    
    case 'employmentType':
      const typeChoice = message.trim();
      if (!EMPLOYMENT_TYPES[typeChoice]) {
        return `Please select a valid employment type (1-4)`;
      }
      tempData.employmentType = EMPLOYMENT_TYPES[typeChoice];
      tempData.step = 'experience';
      user.tempJobData = tempData;
      await user.save();
      return `Step 7/8: What *experience level* is required?\n\nExample: "2-5 years", "Entry level", or "Senior level (5+ years)"`;
    
    case 'experience':
      tempData.experience = message.trim();
      tempData.step = 'skills';
      user.tempJobData = tempData;
      await user.save();
      return `Step 8/8: List the *key skills* required (separate with commas):\n\nExample: "JavaScript, React, Node.js" or "SEO, Content Marketing, Analytics"`;
    
    case 'skills':
      tempData.skills = message.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
      tempData.step = 'company';
      user.tempJobData = tempData;
      await user.save();
      return `Almost done! What's your *company name*?`;
    
    case 'company':
      tempData.companyName = message.trim();
      user.companyName = message.trim(); // Store in user profile too
      tempData.step = 'email';
      user.tempJobData = tempData;
      await user.save();
      return `Last step! What's your *contact email* for applications?`;
    
    case 'email':
      const email = message.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return `Please provide a valid email address.`;
      }
      
      tempData.contactEmail = email;
      
      // Create job posting preview
      const preview = `📋 *Job Posting Preview:*\n\n` +
        `*${tempData.title}*\n` +
        `🏢 ${tempData.companyName}\n` +
        `📂 ${tempData.category}\n` +
        `💰 ${tempData.salary}\n` +
        `📍 ${tempData.location}\n` +
        `⏰ ${tempData.employmentType}\n` +
        `🎯 ${tempData.experience}\n` +
        `🛠️ ${tempData.skills.join(', ')}\n` +
        `📧 ${tempData.contactEmail}\n\n` +
        `*Description:*\n${tempData.description}\n\n` +
        `💳 *Posting fee: $20*\n\n` +
        `Reply *"post"* to proceed with payment, or *"edit"* to make changes.`;
      
      user.conversationState = 'employer_payment_pending';
      await user.save();
      
      return preview;
  }
  
  return `I'm having trouble processing your information. Let's start over. Type "restart" to begin again.`;
}

async function handleEmployerPaymentCheck(user, message) {
  const msg = message.toLowerCase().trim();
  
  if (msg === 'post') {
    try {
      const tempData = user.tempJobData;
      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 2000, // $20.00 in cents
        currency: 'usd',
        metadata: {
          type: 'job_posting',
          userId: user._id.toString()
        }
      });
      
      // Create job record
      const job = new Job({
        title: tempData.title,
        description: tempData.description,
        category: tempData.category,
        salary: tempData.salary,
        location: tempData.location,
        employmentType: tempData.employmentType,
        experience: tempData.experience,
        skills: tempData.skills,
        companyName: tempData.companyName,
        contactEmail: tempData.contactEmail,
        employerId: user._id,
        paymentIntentId: paymentIntent.id,
        status: 'pending_approval'
      });
      
      await job.save();
      
      // Create payment link
      const paymentLink = `${process.env.FRONTEND_URL}/payment?pi=${paymentIntent.client_secret}`;
      
      // Clear temp data
      user.tempJobData = {};
      await user.save();
      
      return `💳 *Payment Required*\n\nClick here to pay your $20 posting fee:\n${paymentLink}\n\n✅ After payment, your job will be reviewed by our team and go live within 24 hours!\n\n⏰ Payment link expires in 1 hour.`;
      
    } catch (error) {
      console.error('Job creation error:', error);
      return `Sorry, there was an error creating your job post. Please try again or contact support.`;
    }
  }
  
  if (msg === 'edit') {
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    return `Let's start over! What's the *job title*?`;
  }
  
  return `Please reply *"post"* to proceed with payment or *"edit"* to make changes.`;
}

// =============================================================================
// COMPLETED USER FLOW
// =============================================================================

async function handleCompletedUser(user, message) {
  const msg = message.toLowerCase().trim();
  
  if (msg === 'jobs' || msg === 'find jobs') {
    user.conversationState = 'employee_choosing_category';
    await user.save();
    return `Which category interests you?\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other`;
  }
  
  if (msg === 'post job' || msg === 'post') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    return `Let's post your job! 📝\n\nStep 1/8: What's the *job title*?`;
  }
  
  if (msg === 'help' || msg === 'menu') {
    return `🤖 *WhatsApp Job Portal Menu:*\n\n` +
      `• Type *"jobs"* to find job opportunities\n` +
      `• Type *"post job"* to post a new job\n` +
      `• Type *"status"* to check your applications\n` +
      `• Type *"help"* to see this menu\n\n` +
      `What would you like to do today?`;
  }
  
  if (msg === 'status') {
    if (user.role === 'employee') {
      const applications = await Application.find({ userId: user._id })
        .populate('jobId', 'title companyName')
        .sort({ applicationDate: -1 })
        .limit(5);
      
      if (applications.length === 0) {
        return `You haven't applied to any jobs yet. Type *"jobs"* to start exploring!`;
      }
      
      let statusMsg = `📊 *Your Application Status:*\n\n`;
      applications.forEach((app, index) => {
        statusMsg += `${index + 1}. *${app.jobId.title}* at ${app.jobId.companyName}\n`;
        statusMsg += `   Status: *${app.applicationStatus}*\n`;
        statusMsg += `   Payment: *${app.paymentStatus}*\n\n`;
      });
      
      return statusMsg + `Type *"jobs"* to find more opportunities!`;
    }
    
    if (user.role === 'employer') {
      const jobs = await Job.find({ employerId: user._id })
        .sort({ createdAt: -1 })
        .limit(5);
      
      if (jobs.length === 0) {
        return `You haven't posted any jobs yet. Type *"post job"* to get started!`;
      }
      
      let statusMsg = `📊 *Your Job Posts:*\n\n`;
      jobs.forEach((job, index) => {
        statusMsg += `${index + 1}. *${job.title}*\n`;
        statusMsg += `   Status: *${job.status}*\n`;
        statusMsg += `   Payment: *${job.paymentStatus}*\n\n`;
      });
      
      return statusMsg + `Type *"post job"* to create another posting!`;
    }
  }
  
  // Default response
  return `Hi! 👋 Welcome back to WhatsApp Job Portal!\n\n` +
    `• Type *"jobs"* to find opportunities\n` +
    `• Type *"post job"* to hire talent\n` +
    `• Type *"status"* to check your activity\n` +
    `• Type *"help"* for more options\n\n` +
    `What can I help you with today?`;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default router;