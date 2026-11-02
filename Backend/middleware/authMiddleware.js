const { verifyAccessToken } = require('../services/tokenService');
const User = require('../models/User');

/**
 * Middleware to protect routes requiring authentication
 */
const authenticate = (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Verify the token
    const decoded = verifyAccessToken(token);
    
    // Add the user ID to the request object
    req.userId = decoded.userId;
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid token. Authentication failed.' 
    });
  }
};

/**
 * Middleware to protect routes (loads user into req.user)
 */
const protect = async (req, res, next) => {
  // First, run authenticate to verify the token and set req.userId
  authenticate(req, res, async () => {
    try {
      // Load full user object for controllers
      const user = await User.findById(req.userId);
      
      if (!user || !user.active) {
        return res.status(401).json({ 
          success: false, 
          message: 'User not found or inactive.' 
        });
      }
      
      // Add user object to request
      req.user = user;
      
      next();
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. Authentication failed.' 
      });
    }
  });
};

/**
 * Middleware to restrict access based on user role
 */
const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      // User must be authenticated first
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Access denied. User not authenticated.' 
        });
      }
      
      // If no roles specified, any authenticated user can access
      if (roles.length === 0) {
        return next();
      }
      
      // Check if user has required role
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. Insufficient permissions.' 
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({ 
        success: false, 
        message: 'Authorization error', 
        error: error.message 
      });
    }
  };
};

/**
 * Middleware to require admin role
 */
const requireAdmin = async (req, res, next) => {
  try {
    // User must be authenticated first
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. User not authenticated.' 
      });
    }
    
    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin privileges required.' 
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Authorization error', 
      error: error.message 
    });
  }
};

module.exports = { authenticate, protect, authorize, requireAdmin }; 