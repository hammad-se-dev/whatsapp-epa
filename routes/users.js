import express from 'express';
import { User, Application, Job } from '../models/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all users (for admin portal) - requires authentication
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (role) filter.role = role;
    
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(filter);
    
    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user analytics - requires authentication
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const employees = await User.countDocuments({ role: 'employee' });
    const employers = await User.countDocuments({ role: 'employer' });
    
    const totalJobs = await Job.countDocuments();
    const liveJobs = await Job.countDocuments({ status: 'live' });
    const pendingJobs = await Job.countDocuments({ status: 'pending_approval' });
    
    const totalApplications = await Application.countDocuments();
    const paidApplications = await Application.countDocuments({ paymentStatus: 'completed' });
    
    // Revenue calculation (applications: $5 each, job posts: $20 each)
    const applicationRevenue = paidApplications * 5;
    const paidJobPosts = await Job.countDocuments({ paymentStatus: 'completed' });
    const jobPostRevenue = paidJobPosts * 20;
    const totalRevenue = applicationRevenue + jobPostRevenue;
    
    res.json({
      users: {
        total: totalUsers,
        employees,
        employers
      },
      jobs: {
        total: totalJobs,
        live: liveJobs,
        pending: pendingJobs
      },
      applications: {
        total: totalApplications,
        paid: paidApplications
      },
      revenue: {
        total: totalRevenue,
        applications: applicationRevenue,
        jobPosts: jobPostRevenue
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific user details - requires authentication
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's applications if employee
    let applications = [];
    if (user.role === 'employee') {
      applications = await Application.find({ userId: id })
        .populate('jobId', 'title companyName category')
        .sort({ applicationDate: -1 });
    }
    
    // Get user's job posts if employer
    let jobs = [];
    if (user.role === 'employer') {
      jobs = await Job.find({ employerId: id })
        .sort({ createdAt: -1 });
    }
    
    res.json({
      user,
      applications,
      jobs
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;