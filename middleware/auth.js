import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

// Middleware to verify JWT token
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        message: 'Please login to access this resource'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find admin user
    const admin = await Admin.findById(decoded.adminId).select('-password');
    
    if (!admin) {
      return res.status(401).json({ 
        error: 'Invalid token.',
        message: 'Admin user not found'
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({ 
        error: 'Account deactivated.',
        message: 'Your account has been deactivated'
      });
    }

    // Add admin info to request
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired.',
        message: 'Your session has expired. Please login again'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.',
        message: 'Invalid authentication token'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal server error.',
      message: 'Authentication failed'
    });
  }
};

// Middleware to check if user is admin
export const requireAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ 
      error: 'Authentication required.',
      message: 'Please login to access this resource'
    });
  }

  if (req.admin.role !== 'admin' && req.admin.role !== 'super_admin') {
    return res.status(403).json({ 
      error: 'Access denied.',
      message: 'Insufficient permissions'
    });
  }

  next();
};

// Middleware to check if user is super admin
export const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ 
      error: 'Authentication required.',
      message: 'Please login to access this resource'
    });
  }

  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ 
      error: 'Access denied.',
      message: 'Super admin privileges required'
    });
  }

  next();
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const admin = await Admin.findById(decoded.adminId).select('-password');
      
      if (admin && admin.isActive) {
        req.admin = admin;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail the request, just continue without admin info
    next();
  }
};

// Generate JWT token
export const generateToken = (adminId) => {
  return jwt.sign(
    { adminId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Refresh token middleware
export const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        message: 'Please provide a valid token'
      });
    }

    // Verify token (even if expired)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    // Check if admin still exists and is active
    const admin = await Admin.findById(decoded.adminId).select('-password');
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Admin user not found or inactive'
      });
    }

    // Generate new token
    const newToken = generateToken(admin._id);

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      admin: admin.toSafeObject()
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ 
      error: 'Token refresh failed',
      message: 'Invalid token provided'
    });
  }
};
