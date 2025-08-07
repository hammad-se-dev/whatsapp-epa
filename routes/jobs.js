import express from 'express';
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
      currentPage: page,
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
    const { category } = req.query;
    
    const filter = { status: 'live' };
    if (category) filter.category = category;
    
    const jobs = await Job.find(filter)
      .select('-employerId -paymentIntentId -adminNotes')
      .sort({ createdAt: -1 });
    
    res.json(jobs);
  } catch (error) {
    console.error('Get live jobs error:', error);
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
    const { adminNotes = '' } = req.body;
    
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
    
    const applications = await Application.find({ jobId: id })
      .populate('userId', 'whatsappNumber')
      .sort({ applicationDate: -1 });
    
    res.json(applications);
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;