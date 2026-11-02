module.exports = {
  // JWT access token settings
  accessToken: {
    secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET,
    expiresIn: process.env.JWT_EXPIRE || process.env.JWT_ACCESS_EXPIRES || '15m' // 15 minutes
  },
  
  // JWT refresh token settings
  refreshToken: {
    secret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.REFRESH_TOKEN_EXPIRE || process.env.JWT_REFRESH_EXPIRES || '7d' // 7 days
  },
  
  // Password reset token settings
  resetToken: {
    expiresIn: '1h' // 1 hour
  },
  
  // Cookie settings for refresh token
  cookie: {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAME_SITE || 'strict',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}; 