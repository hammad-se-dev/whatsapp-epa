import express from 'express';
import twilio from 'twilio';
import { User } from '../models/index.js';

const router = express.Router();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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

// Function to process messages based on user state
async function processMessage(user, message) {
  switch (user.conversationState) {
    case 'new_user':
      return handleNewUser(user);
    
    case 'choosing_role':
      return handleRoleSelection(user, message);
    
    // Add more states as we build the chatbot logic
    default:
      return "I'm still learning! Please try again later.";
  }
}

async function handleNewUser(user) {
  user.conversationState = 'choosing_role';
  await user.save();
  
  return `Welcome to WhatsApp Job Portal! 👋\n\nAre you looking for:\n\n1️⃣ A Job (Job Seeker)\n2️⃣ To Post a Job (Employer)\n\nReply with 1 or 2`;
}

async function handleRoleSelection(user, message) {
  const choice = message.trim();
  
  if (choice === '1') {
    user.role = 'employee';
    user.conversationState = 'employee_choosing_category';
    await user.save();
    
    return `Great! You're looking for a job. 💼\n\nWhich category interests you?\n\n1️⃣ Tech\n2️⃣ Marketing\n3️⃣ Sales\n4️⃣ Finance\n5️⃣ HR\n6️⃣ Operations\n7️⃣ Other\n\nReply with the number`;
  }
  
  if (choice === '2') {
    user.role = 'employer';
    user.conversationState = 'employer_entering_details';
    await user.save();
    
    return `Perfect! Let's post your job. 📝\n\nFirst, what's the job title?\n\nExample: "Senior Software Developer" or "Marketing Manager"`;
  }
  
  return `Please reply with 1 for Job Seeker or 2 for Employer`;
}

export default router;