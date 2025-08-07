import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Tech', 'Marketing', 'Sales', 'Finance', 'HR', 'Operations', 'Other']
  },
  salary: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  employmentType: {
    type: String,
    required: true,
    enum: ['Full-time', 'Part-time', 'Contract', 'Freelance']
  },
  experience: {
    type: String,
    required: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  contactEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  // Status management
  status: {
    type: String,
    enum: ['pending_approval', 'live', 'rejected', 'expired'],
    default: 'pending_approval'
  },
  // References
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Payment info
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentIntentId: {
    type: String,
    default: null
  },
  // Admin actions
  adminNotes: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
jobSchema.index({ category: 1, status: 1 });
jobSchema.index({ employerId: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);

export default Job;