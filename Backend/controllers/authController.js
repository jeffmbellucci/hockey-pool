const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken
} = require('../services/tokenService');
const authConfig = require('../config/auth');
const { isValidRole, ROLES } = require('../config/roles');

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Admin
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name, lastName, role } = req.body;

    // Validate input
    if (!email || !password || !name || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check password strength
    // Note: length >= 8 is acceptable for this private 16-user pool app.
    // For a public-facing app, add complexity requirements (uppercase, numbers, special chars).
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Validate role if provided
    if (role && !isValidRole(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user with specified role or default to Player
    const user = await User.create({
      email,
      password,
      name,
      lastName,
      role: role || ROLES.PLAYER
    });

    console.log('User registered:', user.email);

    // Return success with tokens
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 * @access Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Find user by email
    const user = await User.findByEmail(email);

    // Check if user exists and is active
    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password is correct
    const isMatch = await User.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate access token
    const accessToken = generateAccessToken(user.id);

    // Generate refresh token
    const refreshToken = await generateRefreshToken(user.id);

    // Set refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, authConfig.cookie);

    console.log('User logged in:', user.email);

    // Return success with tokens
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
      },
      token: accessToken
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 * @route POST /api/auth/refresh-token
 * @access Public (with refresh token)
 */
const refreshToken = async (req, res, next) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided'
      });
    }

    // Verify refresh token
    const user = await verifyRefreshToken(refreshToken);

    // Generate new access token
    const accessToken = generateAccessToken(user.id);

    // Generate new refresh token
    const newRefreshToken = await generateRefreshToken(user.id);

    // Set new refresh token in cookie
    res.cookie('refreshToken', newRefreshToken, authConfig.cookie);

    // Return success with new tokens
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      accessToken
    });
  } catch (error) {
    // Clear the invalid cookie
    res.clearCookie('refreshToken');

    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};

/**
 * Logout user
 * @route POST /api/auth/logout
 * @access Private
 */
const logout = async (req, res, next) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies.refreshToken;
    const userId = req.userId;

    if (refreshToken) {
      // Find user with this refresh token
      const user = await User.findByRefreshToken(refreshToken);

      if (user) {
        // Revoke the refresh token
        await revokeRefreshToken(user.id);
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    // Return success
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};



module.exports = {
  register,
  login,
  refreshToken,
  logout
};
