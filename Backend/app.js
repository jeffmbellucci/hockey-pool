const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require('cookie-parser');
const { createServer } = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();

// Configure Express to trust proxy headers (for proper IP detection behind proxies)
// Only trust the last proxy in the chain - this is typically sufficient for most setups
app.set('trust proxy', 1);

// Import database and run migrations
const pool = require('./config/database');
const runMigrations = require('./config/runMigrations');

// Import routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const contestRoutes = require("./routes/contestRoutes");
const adminRoutes = require("./routes/adminRoutes");
const playoffStandingsRoutes = require("./routes/playoffStandingsRoutes");
const chatRoutes = require("./routes/chatRoutes");
const gamesRoutes = require("./routes/gamesRoutes");
const playoffGamesRoutes = require("./routes/playoffGamesRoutes");
const survivorRoutes = require("./routes/survivorRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// Import middleware
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

// Import scheduler service
const schedulerService = require('./services/schedulerService');

// Validate required secrets at startup
const authConfig = require('./config/auth');
if (!authConfig.accessToken.secret) {
  console.error('FATAL: JWT_SECRET or JWT_ACCESS_SECRET must be set');
  process.exit(1);
}
if (!authConfig.refreshToken.secret) {
  console.error('FATAL: REFRESH_TOKEN_SECRET or JWT_REFRESH_SECRET must be set');
  process.exit(1);
}

// Security middleware
app.use(helmet()); // Set various HTTP headers for security

// Body parsing & cookies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  // Configure rate limiter to work with proxies
  trustProxy: false, // Disable the built-in proxy trust validation
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

app.use("/api/auth", apiLimiter);

// Parse client URLs for CORS
const clientUrls = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ["http://localhost:8080"];

// Standard middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    if (clientUrls.indexOf(origin) !== -1 || !origin) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS policy violation'), false);
    }
  },
  credentials: true // Allow cookies when using CORS
}));


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contest", contestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/playoff-standings", playoffStandingsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/playoff-games", playoffGamesRoutes);
app.use("/api/survivor", survivorRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4001;

// Create and start HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: clientUrls,
    credentials: true,
    methods: ["GET", "POST"]
  }
});

// Store online users
const onlineUsers = new Map(); // userId -> { socketId, username, role }

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const { verifyAccessToken } = require('./services/tokenService');
    const User = require('./models/User');

    const decoded = verifyAccessToken(token);

    // Fetch user from database
    const user = await User.findById(decoded.userId);

    if (!user || !user.active) {
      return next(new Error('Authentication error: User not found or inactive'));
    }

    socket.userId = user.id;
    socket.username = user.name;
    socket.userRole = user.role;
    next();
  } catch (err) {
    console.error('Socket auth error:', err);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (ID: ${socket.userId})`);

  // Per-socket message rate limiter: max 5 messages per 10 seconds
  const messageTimes = [];
  const RATE_LIMIT_WINDOW = 10_000; // 10 seconds
  const RATE_LIMIT_MAX = 5;

  // Add user to online users
  onlineUsers.set(socket.userId, {
    socketId: socket.id,
    username: socket.username,
    role: socket.userRole
  });

  // Broadcast updated online users list
  io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
    username: u.username,
    role: u.role
  })));

  // Handle new chat message
  socket.on('chat:message', async (data, acknowledge) => {
    const reject = message => {
      if (typeof acknowledge === 'function') acknowledge({ success: false, message });
      else socket.emit('chat:error', { message });
    };
    try {
      const ChatMessage = require('./models/ChatMessage');
      const { verifyAccessToken } = require('./services/tokenService');

      // Re-verify token before processing message
      const token = socket.handshake.auth.token;
      try {
        verifyAccessToken(token);
      } catch (tokenErr) {
        reject('Session expired. Reconnect to send your saved draft.');
        socket.disconnect(true);
        return;
      }

      const currentUser = await require('./models/User').findById(socket.userId);
      if (!currentUser?.active) {
        reject('Your account is inactive. Please contact the administrator.');
        socket.disconnect(true);
        return;
      }
      socket.userRole = currentUser.role;

      // Validate message
      const message = typeof data?.message === 'string' ? data.message.trim() : '';
      if (!message || message.length > 500) {
        reject(message ? 'Message too long (max 500 chars)' : 'Message cannot be empty');
        return;
      }

      // Rate limit check
      const now = Date.now();
      // Remove entries older than the window
      while (messageTimes.length > 0 && messageTimes[0] <= now - RATE_LIMIT_WINDOW) {
        messageTimes.shift();
      }
      if (messageTimes.length >= RATE_LIMIT_MAX) {
        reject('Too many messages. Please wait a few seconds.');
        return;
      }
      messageTimes.push(now);

      // Determine message type based on user role
      let messageType = 'user';
      if (socket.userRole === 'admin' || socket.userRole === 'superadmin') {
        messageType = 'admin';
      }

      // Save message to database
      const savedMessage = await ChatMessage.createMessage({
        userId: socket.userId,
        username: socket.username,
        message: message,
        type: messageType
      });

      // Broadcast message to all connected clients
      io.emit('chat:message', {
        id: savedMessage.id,
        userId: savedMessage.user_id,
        userName: savedMessage.username,
        message: savedMessage.message,
        timestamp: savedMessage.created_at,
        type: savedMessage.type
      });
      if (typeof acknowledge === 'function') acknowledge({ success: true });
    } catch (error) {
      console.error('Error handling chat message:', error);
      reject('Failed to send message. Your draft has been kept.');
    }
  });

  // Handle user typing indicator
  socket.on('chat:typing', (data) => {
    socket.broadcast.emit('chat:typing', {
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username}`);
    onlineUsers.delete(socket.userId);

    // Broadcast updated online users list
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      username: u.username,
      role: u.role
    })));
  });
});

// Make io available to routes if needed
app.set('io', io);

// Do not accept requests or start scheduled writes against an outdated schema.
runMigrations().then(() => {
  httpServer.listen(PORT, process.env.HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Socket.IO initialized for real-time chat');
    console.log('Environment variables loaded:', {
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? '****' : 'undefined',
      DB_HOST: process.env.DB_HOST ? '****' : 'undefined',
    });

    // Start the scheduler service for automated tasks
    console.log('');
    schedulerService.start();
  });
}).catch(error => {
  console.error('Startup failed: database migrations did not complete', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  schedulerService.stop();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  schedulerService.stop();
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
module.exports = { httpServer, io };
