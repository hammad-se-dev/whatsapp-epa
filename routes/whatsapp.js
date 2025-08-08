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
      // Check if in debug mode to avoid rate limits during testing
      if (process.env.DEBUG_MODE === 'true') {
        console.log('🤖 DEBUG - Bot would send:', response);
        console.log('📱 To user:', whatsappNumber);
        console.log('---');
      } else {
        try {
          await client.messages.create({
            body: response,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: from
          });
          console.log('✅ Message sent successfully to', whatsappNumber);
        } catch (messageError) {
          console.error('❌ Failed to send message:', messageError.code, messageError.message);
          
          // Log rate limit details
          if (messageError.code === 63038) {
            console.log('📊 Rate limit hit - switching to DEBUG mode temporarily');
            console.log('🤖 Would have sent:', response);
            console.log('📱 To user:', whatsappNumber);
          }
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    
    // Handle Twilio rate limiting
    if (error.code === 63038) {
      console.log('Hit Twilio daily message limit. Response not sent but processing completed.');
      res.status(200).send('Rate limited but processed');
      return;
    }
    
    res.status(500).send('Error processing message');
  }
});

// Main message processing function
async function processMessage(user, message) {
  console.log(`Processing message for user ${user.whatsappNumber}, state: ${user.conversationState}`);
  
  const msg = message.toLowerCase().trim();
  
  // Handle global commands that work from any state (HIGHEST PRIORITY)
  if (msg === 'restart' || msg === 'start over') {
    user.conversationState = 'new_user';
    user.tempJobData = {};
    user.currentJobId = null;
    user.role = null;
    await user.save();
    return handleNewUser(user);
  }
  
  if (msg === 'hi' || msg === 'hello' || msg === 'hey' || msg === 'menu' || msg === 'help') {
    return getMainMenu(user);
  }
  
  // Smart detection: if user mentions wanting jobs/positions, switch to employee mode
  if (msg.includes('want') && (msg.includes('job') || msg.includes('position')) && 
      (msg.includes('software') || msg.includes('developer') || msg.includes('work'))) {
    user.role = 'employee';
    user.conversationState = 'employee_choosing_category';
    user.tempJobData = {};
    user.currentJobId = null;
    await user.save();
    return getCategorySelection();
  }
  
  if (msg === 'job posting' || msg === 'post job' || msg === 'post a job' || msg === 'hire' || msg === 'employer') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    user.currentJobId = null;
    await user.save();
    return getJobPostingStep(user);
  }
  
  if (msg === 'find jobs' || msg === 'jobs' || msg === 'job search' || msg === 'employee') {
    user.role = 'employee';
    user.conversationState = 'employee_choosing_category';
    user.tempJobData = {};
    user.currentJobId = null;
    await user.save();
    return getCategorySelection();
  }
  
  if (msg === 'status') {
    return handleStatusCommand(user);
  }
  
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
      user.conversationState = 'new_user';
      await user.save();
      return "I'm having trouble understanding. Let me restart our conversation.\n\n" + await handleNewUser(user);
  }
}

// =============================================================================
// UTILITY FUNCTIONS FOR CONSISTENT MESSAGING
// =============================================================================

function getMainMenu(user) {
  return `🤖 *WhatsApp Job Portal* 👋\n\n` +
    `Welcome${user.role ? ` back` : ''}! Here's what I can help you with:\n\n` +
    `🔍 *For Job Seekers:*\n` +
    `• Type *"jobs"* or *"find jobs"* to browse opportunities\n` +
    `• Type *"status"* to check your applications\n\n` +
    `💼 *For Employers:*\n` +
    `• Type *"post job"* or *"job posting"* to hire talent\n` +
    `• Type *"status"* to check your job posts\n\n` +
    `🛠️ *Other Commands:*\n` +
    `• Type *"help"* or *"menu"* to see this menu\n` +
    `• Type *"restart"* to start fresh\n\n` +
    `What would you like to do today?`;
}

function getCategorySelection() {
  return `Great! Let's find you a job! 💼\n\nWhich category interests you?\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other\n\nReply with the number (1-7)`;
}

// SIMPLIFIED JOB POSTING - ONLY 4 QUESTIONS
function getJobPostingStep(user) {
  const tempData = user.tempJobData || { step: 'title' };
  const step = tempData.step;
  
  // Show current progress - Only 4 steps now
  const stepNumbers = {
    'title': '1/4',
    'description': '2/4', 
    'category': '3/4',
    'salary': '4/4'
  };
  
  const currentProgress = stepNumbers[step] || '1/4';
  
  // Show what we have so far if not the first step
  let progressSummary = '';
  if (step !== 'title' && Object.keys(tempData).length > 1) {
    progressSummary = `📋 *Progress so far:*\n`;
    if (tempData.title) progressSummary += `✅ Job Title: ${tempData.title}\n`;
    if (tempData.description) progressSummary += `✅ Description: ${tempData.description.length > 50 ? tempData.description.substring(0, 50) + '...' : tempData.description}\n`;
    if (tempData.category) progressSummary += `✅ Category: ${tempData.category}\n`;
    progressSummary += '\n';
  }
  
  switch (step) {
    case 'title':
      return `🎯 *Quick Job Posting - Step ${currentProgress}*\n\nWhat's the *job title*?\n\nExample: "Senior Software Developer" or "Marketing Manager"`;
    
    case 'description':
      return `${progressSummary}📝 *Quick Job Posting - Step ${currentProgress}*\n\nPlease provide a *brief job description*.\n\nInclude key responsibilities and requirements!\n\n(Write at least 20 characters)`;
    
    case 'category':
      return `${progressSummary}📂 *Quick Job Posting - Step ${currentProgress}*\n\nSelect the *job category*:\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other\n\nReply with the number (1-7)`;
    
    case 'salary':
      return `${progressSummary}💰 *Quick Job Posting - Step ${currentProgress}*\n\nWhat's the *salary range*?\n\nExample: "$50,000 - $70,000 per year" or "$25/hour"`;
    
    default:
      return `🎯 *Quick Job Posting - Step 1/4*\n\nWhat's the *job title*?\n\nExample: "Senior Software Developer" or "Marketing Manager"`;
  }
}

// =============================================================================
// NEW USER FLOW
// =============================================================================

async function handleNewUser(user) {
  user.conversationState = 'choosing_role';
  await user.save();
  
  return getMainMenu(user);
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
    
    return getCategorySelection();
  }
  
  if (choice === '2') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    
    return getJobPostingStep(user);
  }
  
  return getMainMenu(user);
}

// =============================================================================
// EMPLOYEE FLOW (UNCHANGED)
// =============================================================================

async function handleCategorySelection(user, message) {
  const choice = message.trim();
  
  if (!CATEGORIES[choice]) {
    return getCategorySelection();
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
  if (message.toLowerCase().includes('back')) {
    user.conversationState = 'employee_choosing_category';
    await user.save();
    return getCategorySelection();
  }
  
  // Handle "choose another category" option when no jobs available
  if (message.trim() === '1' && user.preferredCategory) {
    // Check if this is from the "no jobs available" scenario
    const jobs = await Job.find({ 
      category: user.preferredCategory, 
      status: 'live' 
    });
    
    if (jobs.length === 0) {
      // User chose to select another category
      user.conversationState = 'employee_choosing_category';
      await user.save();
      return getCategorySelection();
    }
  }
  
  // Get jobs in user's preferred category
  const jobs = await Job.find({ 
    category: user.preferredCategory, 
    status: 'live' 
  }).limit(5).sort({ createdAt: -1 });
  
  if (isNaN(choice) || choice < 1 || choice > jobs.length) {
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
      
      // Create payment link
      const paymentLink = `${process.env.FRONTEND_URL}/payment?pi=${paymentIntent.client_secret}&type=application&amount=500`;
      
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
// SIMPLIFIED EMPLOYER FLOW - ONLY 4 QUESTIONS
// =============================================================================

async function handleEmployerJobEntry(user, message) {
  const tempData = user.tempJobData || { step: 'title' };
  const step = tempData.step;
  
  console.log(`🔍 Employer job entry - Step: ${step}, Message: "${message}", Current tempData:`, JSON.stringify(tempData));
  
  const msg = message.toLowerCase().trim();
  
  // Handle back command
  if (msg === 'back' || msg === 'previous') {
    const stepOrder = ['title', 'description', 'category', 'salary'];
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) {
      tempData.step = stepOrder[currentIndex - 1];
      user.tempJobData = tempData;
      await user.save();
    }
    return getJobPostingStep(user);
  }
  
  switch (step) {
    case 'title':
      if (!message || message.trim().length < 3) {
        console.log('❌ Title validation failed');
        return `Please provide a proper job title (at least 3 characters).\n\nExample: "Senior Software Developer" or "Marketing Manager"`;
      }
      tempData.title = message.trim();
      tempData.step = 'description';
      user.tempJobData = tempData;
      await user.save();
      console.log('✅ Title saved:', tempData.title);
      return getJobPostingStep(user);
    
    case 'description':
      if (!message || message.trim().length < 20) {
        console.log('❌ Description validation failed');
        return `Please provide a job description (at least 20 characters).\n\nInclude key responsibilities and requirements!`;
      }
      tempData.description = message.trim();
      tempData.step = 'category';
      user.tempJobData = tempData;
      await user.save();
      console.log('✅ Description saved:', tempData.description.substring(0, 50) + '...');
      return getJobPostingStep(user);
    
    case 'category':
      const categoryChoice = message.trim();
      if (!CATEGORIES[categoryChoice]) {
        console.log('❌ Category validation failed');
        return `Please select a valid category number (1-7):\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other`;
      }
      tempData.category = CATEGORIES[categoryChoice];
      tempData.step = 'salary';
      user.tempJobData = tempData;
      await user.save();
      console.log('✅ Category saved:', tempData.category);
      return getJobPostingStep(user);
    
    case 'salary':
      if (!message || message.trim().length < 3) {
        console.log('❌ Salary validation failed');
        return `Please provide a salary range (at least 3 characters).\n\nExample: "$50,000 - $70,000 per year" or "$25/hour"`;
      }
      tempData.salary = message.trim();
      
      // Set default values for missing fields
      tempData.location = "Remote/On-site";
      tempData.employmentType = "Full-time";
      tempData.experience = "As specified in job description";
      tempData.skills = ["As specified in job description"];
      tempData.companyName = user.companyName || "Your Company";
      tempData.contactEmail = user.email || "contact@company.com";
      
      // Create job posting preview
      const preview = `📋 *Job Posting Preview:*\n\n` +
        `*${tempData.title}*\n` +
        `🏢 ${tempData.companyName}\n` +
        `📂 ${tempData.category}\n` +
        `💰 ${tempData.salary}\n` +
        `📍 ${tempData.location}\n` +
        `⏰ ${tempData.employmentType}\n\n` +
        `*Description:*\n${tempData.description}\n\n` +
        `💳 *Posting fee: $20*\n\n` +
        `Reply *"post"* to proceed with payment, or *"edit"* to make changes.`;
      
      user.conversationState = 'employer_payment_pending';
      user.tempJobData = tempData; // Keep the data for payment processing
      await user.save();
      console.log('✅ All data collected, moving to payment step');
      
      return preview;
      
    default:
      // Reset if invalid step
      console.log('❌ Invalid step, resetting to title');
      user.tempJobData = { step: 'title' };
      await user.save();
      return getJobPostingStep(user);
  }
}

async function handleEmployerPaymentCheck(user, message) {
  const msg = message.toLowerCase().trim();
  
  if (msg === 'post') {
    try {
      const tempData = user.tempJobData;
      
      // Validate temp data
      if (!tempData || !tempData.title || !tempData.description) {
        user.conversationState = 'employer_entering_details';
        user.tempJobData = { step: 'title' };
        await user.save();
        return getJobPostingStep(user);
      }
      
      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 2000, // $20.00 in cents
        currency: 'usd',
        metadata: {
          type: 'job_posting',
          userId: user._id.toString()
        }
      });
      
      // Create job record with all required fields
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
      const paymentLink = `${process.env.FRONTEND_URL}/payment?pi=${paymentIntent.client_secret}&type=job_posting&amount=2000`;
      
      // Clear temp data
      user.tempJobData = {};
      await user.save();
      
      return `💳 *Payment Required*\n\nClick here to pay your $20 posting fee:\n${paymentLink}\n\n✅ After payment, your job will be reviewed and go live within 24 hours!\n\n⏰ Payment link expires in 1 hour.`;
      
    } catch (error) {
      console.error('Job creation error:', error);
      return `Sorry, there was an error creating your job post. Please try again or contact support.`;
    }
  }
  
  if (msg === 'edit') {
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    return getJobPostingStep(user);
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
    user.role = 'employee';
    await user.save();
    return getCategorySelection();
  }
  
  if (msg === 'post job' || msg === 'post' || msg === 'job posting') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    user.tempJobData = { step: 'title' };
    await user.save();
    return getJobPostingStep(user);
  }
  
  if (msg === 'help' || msg === 'menu') {
    return getMainMenu(user);
  }
  
  // Default response - show main menu
  return getMainMenu(user);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function handleStatusCommand(user) {
  if (!user.role) {
    return `You haven't started using the portal yet! Type "jobs" to find work or "post job" to hire.`;
  }
  
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
      statusMsg += `   Payment: *${job.paymentStatus || 'pending'}*\n\n`;
    });
    
    return statusMsg + `Type *"post job"* to create another posting!`;
  }
}

export default router;