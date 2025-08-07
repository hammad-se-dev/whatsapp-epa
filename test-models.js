import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { User, Job, Application } from './models/index.js';

dotenv.config();

async function testModels() {
  try {
    await connectDB();
    console.log('✅ Database connected');
    
    // Test User creation
    const testUser = new User({
      whatsappNumber: '+1234567890',
      role: 'employee'
    });
    await testUser.save();
    console.log('✅ User model works');
    
    // Test Job creation
    const testJob = new Job({
      title: 'Test Job',
      description: 'Test Description',
      category: 'Tech',
      salary: '$50,000',
      location: 'Remote',
      employmentType: 'Full-time',
      experience: '2+ years',
      companyName: 'Test Company',
      contactEmail: 'test@company.com',
      employerId: testUser._id
    });
    await testJob.save();
    console.log('✅ Job model works');
    
    // Test Application creation
    const testApplication = new Application({
      userId: testUser._id,
      jobId: testJob._id,
      applicantWhatsapp: '+1234567890'
    });
    await testApplication.save();
    console.log('✅ Application model works');
    
    // Cleanup
    await User.findByIdAndDelete(testUser._id);
    await Job.findByIdAndDelete(testJob._id);
    await Application.findByIdAndDelete(testApplication._id);
    console.log('✅ Test data cleaned up');
    
    console.log('🎉 All models working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testModels();