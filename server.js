import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/database.js';

// Import routes
import whatsappRoutes from './routes/whatsapp.js';
import stripeRoutes from './routes/stripe.js';
import jobsRoutes from './routes/jobs.js';
import usersRoutes from './routes/users.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to database
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));

// Raw body parser for Stripe webhooks
app.use('/api/stripe/webhook', express.raw({type: 'application/json'}));

// JSON parser for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic routes
app.get('/', (req, res) => {
  res.json({ message: 'WhatsApp Job Portal API is running!' });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Debug endpoint to check environment variables
app.get('/api/debug/env', (req, res) => {
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY ? 'SET' : 'NOT SET',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT SET',
    MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'NOT SET'
  };
  res.json(envVars);
});

// Serve Stripe public key
app.get('/api/stripe/public-key', (req, res) => {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      console.error('STRIPE_PUBLISHABLE_KEY is not set in environment variables');
      return res.status(500).json({ 
        error: 'Stripe configuration missing',
        message: 'STRIPE_PUBLISHABLE_KEY not found in environment variables'
      });
    }
    
    console.log('Serving Stripe public key:', publishableKey.substring(0, 20) + '...');
    res.json({ 
      publishableKey: publishableKey 
    });
  } catch (error) {
    console.error('Error serving Stripe public key:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// API routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/users', usersRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

export default app;