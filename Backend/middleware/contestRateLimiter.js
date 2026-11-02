const rateLimit = require('express-rate-limit');

// Installed after authentication: players sharing a network have independent budgets.
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  keyGenerator: req => String(req.user.id),
  message: { message: 'Too many requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
