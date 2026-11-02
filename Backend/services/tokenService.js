const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authConfig = require('../config/auth');

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId },
    authConfig.accessToken.secret,
    { expiresIn: authConfig.accessToken.expiresIn }
  );
};

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = async (userId) => {
  // Create a refresh token with crypto for added security
  const refreshToken = crypto.randomBytes(40).toString('hex');
  
  // Create expiration date
  const expiresInDays = parseInt(authConfig.refreshToken.expiresIn.replace('d', ''));
  const refreshTokenExp = new Date();
  refreshTokenExp.setDate(refreshTokenExp.getDate() + expiresInDays);
  
  // Save refresh token to user in database
  await User.setRefreshToken(userId, refreshToken, refreshTokenExp);
  
  return refreshToken;
};

/**
 * Verify JWT access token
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, authConfig.accessToken.secret);
  } catch (error) {
    throw new Error('Invalid access token');
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = async (refreshToken) => {
  // Find user with this refresh token that hasn't expired
  const user = await User.findByRefreshToken(refreshToken);
  
  if (!user) {
    throw new Error('Invalid or expired refresh token');
  }
  
  return user;
};

/**
 * Revoke refresh token
 */
const revokeRefreshToken = async (userId) => {
  await User.clearRefreshToken(userId);
};

/**
 * Revoke all refresh tokens (force logout from all devices)
 */
const revokeAllRefreshTokens = async (userId) => {
  await User.clearRefreshToken(userId);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens
}; 