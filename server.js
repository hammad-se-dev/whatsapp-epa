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