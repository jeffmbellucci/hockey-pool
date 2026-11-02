// Role definitions for the application
const ROLES = {
  ADMIN: 'admin',
  PLAYER: 'player'
};

// Check if role is valid
const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

module.exports = { ROLES, isValidRole };

