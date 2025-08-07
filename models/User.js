import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  whatsappNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  conversationState: {
    type: String,
    enum: [
      'new_user', 
      'choosing_role', 
      'employee_choosing_category', 
      'employee_viewing_jobs',
      'employee_payment_pending',
      'employer_entering_details',
      'employer_payment_pending',
      'completed'
    ],
    default: 'new_user'
  },
  role: {
    type: String,
    enum: ['employee', 'employer'],
    default: null
  },
  // For employees
  preferredCategory: {
    type: String,
    default: null
  },
  // For employers
  companyName: {
    type: String,
    default: null
  },
  // Conversation context
  currentJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null
  },
  tempJobData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ whatsappNumber: 1 });
userSchema.index({ conversationState: 1 });

const User = mongoose.model('User', userSchema);

export default User;