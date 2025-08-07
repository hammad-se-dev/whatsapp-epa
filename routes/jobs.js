import express from 'express';
import axios from 'axios';
import { Job, Application } from '../models/index.js';

const router = express.Router();

// Get all jobs (for admin portal)
router.get('/', async (req, res) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    
    const jobs = await Job.find(filter)
      .populate('employerId', 'whatsappNumber companyName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Job.countDocuments(filter);
    
    res.json({
      jobs,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get live jobs (for job seekers)
router.get('/live', async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;
    
    const filter = { status: 'live' };
    if (category) filter.category = category;
    
    const jobs = await Job.find(filter)
      .select('-employerId -paymentIntentId -adminNotes')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(jobs);
  } catch (error) {
    console.error('Get live jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single job details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const job = await Job.findById(id)
      .populate('employerId', 'whatsappNumber companyName');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get application count
    const applicationCount = await Application.countDocuments({ 
      jobId: id, 
      paymentStatus: 'completed' 
    });
    
    const jobWithStats = {
      ...job.toObject(),
      applicationCount
    };
    
    res.json(jobWithStats);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve job (admin action)
router.post('/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes = '' } = req.body;
    
    const job = await Job.findByIdAndUpdate(
      id,
      {
        status: 'live',
        adminNotes,
        approvedAt: new Date(),
        approvedBy: 'admin' // In real app, use actual admin user
      },
      { new: true }
    );
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Send notification to employer via WhatsApp
    try {
      await axios.post(`${process.env.API_URL || 'http://localhost:3001'}/api/stripe/notify-job-approved`, {
        jobId: id
      });
    } catch (notificationError) {
      console.error('Failed to send approval notification:', notificationError.message);
      // Don't fail the approval if notification fails
    }
    
    res.json({ message: 'Job approved successfully', job });
  } catch (error) {
    console.error('Approve job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject job (admin action)
router.post('/reject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes = '', reason = '' } = req.body;
    
    const job = await Job.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        adminNotes
      },
      { new: true }
    );
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Send rejection notification to employer via WhatsApp
    try {
      await axios.post(`${process.env.API_URL || 'http://localhost:3001'}/api/stripe/notify-job-rejected`, {
        jobId: id,
        reason
      });
    } catch (notificationError) {
      console.error('Failed to send rejection notification:', notificationError.message);
      // Don't fail the rejection if notification fails
    }
    
    res.json({ message: 'Job rejected', job });
  } catch (error) {
    console.error('Reject job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job applications
router.get('/:id/applications', async (req, res) => {
  try {
    const { id } = req.params;
    
    const applications = await Application.find({ 
      jobId: id,
      paymentStatus: 'completed' // Only show paid applications
    })
      .populate('userId', 'whatsappNumber')
      .sort({ applicationDate: -1 });
    
    // Add summary statistics
    const stats = {
      total: applications.length,
      byStatus: {
        submitted: applications.filter(app => app.applicationStatus === 'submitted').length,
        viewed_by_employer: applications.filter(app => app.applicationStatus === 'viewed_by_employer').length,
        shortlisted: applications.filter(app => app.applicationStatus === 'shortlisted').length,
        rejected: applications.filter(app => app.applicationStatus === 'rejected').length
      }
    };
    
    res.json({
      applications,
      stats
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update application status
router.patch('/applications/:applicationId/status', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['submitted', 'viewed_by_employer', 'shortlisted', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const application = await Application.findByIdAndUpdate(
      applicationId,
      { applicationStatus: status },
      { new: true }
    ).populate('userId', 'whatsappNumber')
     .populate('jobId', 'title companyName');
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    // Send status update to applicant via WhatsApp
    try {
      let message = '';
      switch (status) {
        case 'viewed_by_employer':
          message = `👀 *Application Update*\n\nGood news! The employer has viewed your application for *${application.jobId.title}* at ${application.jobId.companyName}.\n\nThey may contact you soon if you're a good fit. Keep your phone handy! 📞`;
          break;
        case 'shortlisted':
          message = `🎉 *Great News!*\n\nYou've been *shortlisted* for *${application.jobId.title}* at ${application.jobId.companyName}! 🎊\n\nThe employer is very interested in your profile. Expect to hear from them very soon!\n\nGood luck! 🍀`;
          break;
        case 'rejected':
          message = `📋 *Application Update*\n\nThank you for your interest in *${application.jobId.title}* at ${application.jobId.companyName}.\n\nUnfortunately, they've decided to move forward with other candidates.\n\nDon't give up! Type *"jobs"* to find more opportunities. The right job is out there! 💪`;
          break;
      }
      
      if (message) {
        // You would implement this WhatsApp sending logic
        // await sendWhatsAppMessage(application.userId.whatsappNumber, message);
      }
    } catch (notificationError) {
      console.error('Failed to send status notification:', notificationError.message);
    }
    
    res.json({ message: 'Application status updated', application });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get jobs by employer
router.get('/employer/:employerId', async (req, res) => {
  try {
    const { employerId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    
    const filter = { employerId };
    if (status) filter.status = status;
    
    const jobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Get application counts for each job
    const jobsWithStats = await Promise.all(
      jobs.map(async (job) => {
        const applicationCount = await Application.countDocuments({ 
          jobId: job._id, 
          paymentStatus: 'completed' 
        });
        return {
          ...job.toObject(),
          applicationCount
        };
      })
    );
    
    const total = await Job.countDocuments(filter);
    
    res.json({
      jobs: jobsWithStats,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get employer jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job analytics
router.get('/analytics/summary', async (req, res) => {
  try {
    const totalJobs = await Job.countDocuments();
    const liveJobs = await Job.countDocuments({ status: 'live' });
    const pendingJobs = await Job.countDocuments({ status: 'pending_approval' });
    const rejectedJobs = await Job.countDocuments({ status: 'rejected' });
    
    const totalApplications = await Application.countDocuments({ paymentStatus: 'completed' });
    
    // Jobs by category
    const jobsByCategory = await Job.aggregate([
      { $match: { status: 'live' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Applications by status
    const applicationsByStatus = await Application.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: '$applicationStatus', count: { $sum: 1 } } }
    ]);
    
    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentJobs = await Job.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo },
      status: { $in: ['live', 'pending_approval'] }
    });
    
    const recentApplications = await Application.countDocuments({
      applicationDate: { $gte: thirtyDaysAgo },
      paymentStatus: 'completed'
    });
    
    res.json({
      jobs: {
        total: totalJobs,
        live: liveJobs,
        pending: pendingJobs,
        rejected: rejectedJobs,
        byCategory: jobsByCategory
      },
      applications: {
        total: totalApplications,
        byStatus: applicationsByStatus
      },
      recent: {
        jobs: recentJobs,
        applications: recentApplications
      }
    });
  } catch (error) {
    console.error('Get job analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;