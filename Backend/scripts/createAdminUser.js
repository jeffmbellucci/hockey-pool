#!/usr/bin/env node

/**
 * Script to create an admin user
 * 
 * Usage:
 *   node scripts/createAdminUser.js
 *   
 * Or with command line arguments:
 *   node scripts/createAdminUser.js --email admin@example.com --password secure123 --name John --lastname Doe
 */

require('dotenv').config();
const readline = require('readline');
const User = require('../models/User');
const { ROLES } = require('../config/roles');
const pool = require('../config/database');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
};

const cliEmail = getArg('--email');
const cliPassword = getArg('--password');
const cliName = getArg('--name');
const cliLastName = getArg('--lastname');

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify question function
const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

/**
 * Main function to create admin user
 */
async function createAdminUser() {
  try {
    console.log('=== Admin User Creation Script ===\n');

    let email, password, name, lastName;

    // Check if all arguments are provided via CLI
    if (cliEmail && cliPassword && cliName && cliLastName) {
      email = cliEmail;
      password = cliPassword;
      name = cliName;
      lastName = cliLastName;
      console.log('Using command line arguments...\n');
    } else {
      // Interactive mode
      console.log('Please provide the following information:\n');

      // Get email
      while (!email || !isValidEmail(email)) {
        email = await question('Email: ');
        if (!isValidEmail(email)) {
          console.log('❌ Invalid email format. Please try again.');
          email = null;
        }
      }

      // Get password
      while (!password || !isValidPassword(password)) {
        password = await question('Password (min 6 characters): ');
        if (!isValidPassword(password)) {
          console.log('❌ Password must be at least 6 characters long. Please try again.');
          password = null;
        }
      }

      // Get name
      while (!name || name.trim().length === 0) {
        name = await question('First Name: ');
        if (!name || name.trim().length === 0) {
          console.log('❌ First name is required. Please try again.');
          name = null;
        }
      }

      // Get last name
      while (!lastName || lastName.trim().length === 0) {
        lastName = await question('Last Name: ');
        if (!lastName || lastName.trim().length === 0) {
          console.log('❌ Last name is required. Please try again.');
          lastName = null;
        }
      }
    }

    // Trim whitespace
    email = email.trim();
    name = name.trim();
    lastName = lastName.trim();

    console.log('\n--- User Details ---');
    console.log(`Email: ${email}`);
    console.log(`Name: ${name} ${lastName}`);
    console.log(`Role: ${ROLES.ADMIN}`);
    console.log('--------------------\n');

    // Check if user already exists
    const existingUser = await User.findByEmail(email);

    if (existingUser) {
      console.log(`⚠️  User with email "${email}" already exists.`);

      // Check if the user is already an admin
      if (existingUser.role === ROLES.ADMIN) {
        console.log('❌ This user is already an admin. No changes needed.');
        rl.close();
        process.exit(0);
      }

      // Ask if they want to upgrade to admin
      const upgrade = await question('\nDo you want to upgrade this user to admin role? (yes/no): ');

      if (upgrade.toLowerCase() === 'yes' || upgrade.toLowerCase() === 'y') {
        await User.update(existingUser.id, { role: ROLES.ADMIN });
        console.log(`\n✅ Successfully upgraded user "${email}" to admin role!`);
      } else {
        console.log('\n❌ Operation cancelled.');
      }

      rl.close();
      process.exit(0);
    }

    // Create the admin user
    const adminUser = await User.create({
      email: email,
      password: password,
      name: name,
      lastName: lastName,
      role: ROLES.ADMIN
    });

    console.log('✅ Admin user created successfully!');
    console.log(`\nUser ID: ${adminUser.id}`);
    console.log(`Email: ${adminUser.email}`);
    console.log(`Name: ${adminUser.name} ${adminUser.last_name}`);
    console.log(`Role: ${adminUser.role}`);
    console.log(`Created at: ${adminUser.created_at}`);

  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    rl.close();
    // Close database connection
    await pool.end();
  }
}

// Run the script
createAdminUser();

