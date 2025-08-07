import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  // References
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  // Application details
  applicantWhatsapp: {
    type: String,
    required: true
  },
  // Payment information
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentIntentId: {
    type: String,
    default: null
  },
  paymentAmount: {
    type: Number,
    default: 500 // Application fee in cents ($5.00)
  },
  // Application status
  applicationStatus: {
    type: String,
    enum: ['submitted', 'viewed_by_employer', 'shortlisted', 'rejected'],
    default: 'submitted'
  },
  // Timestamps
  applicationDate: {
    type: Date,
    default: Date.now
  },
  paymentDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Prevent duplicate applications
applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

// Indexes for queries
applicationSchema.index({ paymentStatus: 1 });
applicationSchema.index({ applicationStatus: 1 });
applicationSchema.index({ applicationDate: -1 });

const Application = mongoose.model('Application', applicationSchema);

export default Application;