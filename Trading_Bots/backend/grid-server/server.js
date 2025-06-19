import express from 'express';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { WebSocketV2, SmartAPI } from 'smartapi-javascript';
import { authenticator } from 'otplib';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import axios from 'axios';

// Import Grid-specific modules
import { GridOrder, GridStrategy, GridBacktestResult } from './Models/gridModels.js';
import gridRoutes from './Routes/gridRoutes.js';
import { GridTradingService } from './Services/gridService.js';
import { NIFTY50_STOCKS } from '../shared/constants/stocks.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Environment variables
const ANGEL_CLIENT_CODE = process.env.ANGEL_CLIENT_CODE;
const ANGEL_API_KEY = process.env.ANGEL_API_KEY;
const ANGEL_SECRET_KEY = process.env.ANGEL_SECRET_KEY;
const ANGEL_MPIN = process.env.ANGEL_MPIN;
const ANGEL_TOTP_SECRET = process.env.ANGEL_TOTP_SECRET;
const PORT = process.env.GRID_TRADING_PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/grid_trading';
const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:3000';

// Validate required environment variables for dynamic token generation
const requiredEnvVars = [
  'ANGEL_CLIENT_CODE',
  'ANGEL_API_KEY',
  'ANGEL_MPIN',
  'ANGEL_TOTP_SECRET',
  'DATA_SERVICE_URL'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
}).then(() => {
  console.log('✅ Connected to MongoDB for Grid Trading');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// Store live data and active strategies
const liveData = new Map();
const activeGridStrategies = new Map();

// Connection state tracking
let dataServiceConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Initialize SmartAPI (will be updated with dynamic tokens)
let smartAPI = null;

// Function to generate TOTP
function generateTOTP() {
  if (!ANGEL_TOTP_SECRET) {
    throw new Error('TOTP secret not configured');
  }
  return authenticator.generate(ANGEL_TOTP_SECRET);
}

// Enhanced login function with retry logic and delay
async function loginToSmartAPI(retryCount = 0, maxRetries = 3) {
  try {
    console.log('🔐 Logging in to SmartAPI...');
    console.log(`📋 Client Code: ${ANGEL_CLIENT_CODE}`);
    console.log(`📋 MPIN Length: ${ANGEL_MPIN?.length || 'undefined'}`);
    
    // Add delay for Grid service to avoid TOTP conflicts
    const gridDelay = 30000; // 30 seconds delay for Grid service
    console.log(`⏳ Waiting ${gridDelay/1000}s before Grid service login...`);
    await new Promise(resolve => setTimeout(resolve, gridDelay));
    
    // Create temporary SmartAPI instance for login
    const tempSmartAPI = new SmartAPI({
      api_key: ANGEL_API_KEY
    });
    
    const totp = generateTOTP();
    console.log(`🔢 Generated TOTP: ${totp} (attempt ${retryCount + 1})`);
    
    // Use MPIN for generateSession
    const loginResponse = await tempSmartAPI.generateSession(
      ANGEL_CLIENT_CODE,
      ANGEL_MPIN,
      totp
    );
    
    console.log('📨 Login Response Status:', loginResponse.status);
    console.log('📨 Login Response Message:', loginResponse.message);
    
    if (loginResponse.status && loginResponse.data) {
      // Update main SmartAPI instance with new tokens
      smartAPI = new SmartAPI({
        api_key: ANGEL_API_KEY,
        access_token: loginResponse.data.jwtToken,
        refresh_token: loginResponse.data.refreshToken
      });
      
      console.log('✅ Login successful, tokens refreshed');
      return loginResponse.data;
    } else {
      throw new Error(`Login failed: ${loginResponse.message || loginResponse.errorcode || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ Detailed login error:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    
    if (retryCount < maxRetries && (error.message.includes('Invalid totp') || error.message.includes('Unknown error'))) {
      console.log(`⏳ TOTP validation failed, retrying in 30 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
      return loginToSmartAPI(retryCount + 1, maxRetries);
    }
    throw error;
  }
}

// Email configuration
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'kukrejaaryansh297@gmail.com',
    pass: process.env.EMAIL_PASS || 'ibpyigpdtaibqlvw'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email connection
emailTransporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready for Grid notifications');
  }
});

// Initialize Grid Trading Service (will be updated after login)
let gridService = null;

// Price monitoring for Grid orders
const monitorGridOrderFills = async (priceUpdate) => {
  try {
    if (priceUpdate && priceUpdate.symbol && priceUpdate.ltp) {
      // Update live data
      liveData.set(priceUpdate.symbol, priceUpdate);
      
      // Check for order fills using the Grid service if initialized
      if (gridService) {
        await gridService.checkOrderFills(priceUpdate.symbol, priceUpdate.ltp);
      }
    }
  } catch (error) {
    console.error('❌ Error monitoring Grid order fills:', error);
  }
};

// Socket.IO Client Connection to Data Service
let dataServiceSocket = null;

const connectToDataService = () => {
  try {
    console.log('🔌 Connecting to Data Service via Socket.IO...');
    
    dataServiceSocket = ioClient(DATA_SERVICE_URL, {
      transports: ['polling', 'websocket'], // Try polling first
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 20000,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: false
    });
    
    dataServiceSocket.on('connect', () => {
      console.log('✅ Connected to Data Service via Socket.IO');
      dataServiceConnected = true;
      reconnectAttempts = 0;
      
      // Emit connection status to Grid clients
      io.emit('data_service_status', {
        connected: true,
        timestamp: new Date().toISOString()
      });
    });
    
    dataServiceSocket.on('live_data', async (update) => {
      try {
        if (update.success && update.data) {
          // Process live data for grid strategies
          await monitorGridOrderFills(update.data);
          
          // Broadcast to connected Grid clients
          io.emit('live_data', update.data);
        }
      } catch (error) {
        console.error('❌ Error processing live data:', error);
      }
    });
    
    dataServiceSocket.on('initial_data', (update) => {
      try {
        if (update.success && update.data) {
          // Process initial data dump
          Object.values(update.data).forEach(async (stockData) => {
            liveData.set(stockData.symbol, stockData);
            await monitorGridOrderFills(stockData);
          });
          
        }
      } catch (error) {
        console.error('❌ Error processing initial data:', error);
      }
    });
    
    dataServiceSocket.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected from Data Service: ${reason}`);
      dataServiceConnected = false;
      
      // Emit disconnection status to Grid clients
      io.emit('data_service_status', {
        connected: false,
        reason: reason,
        timestamp: new Date().toISOString()
      });
    });
    
    dataServiceSocket.on('connect_error', (error) => {
      console.error('❌ Data Service connection error:', error.message);
      dataServiceConnected = false;
    });
    
  } catch (error) {
    console.error('❌ Error creating Socket.IO connection:', error);
    dataServiceConnected = false;
  }
};

// Health check for Data Service
const checkDataServiceHealth = async () => {
  try {
    const response = await axios.get(`${DATA_SERVICE_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('❌ Data Service health check failed:', error.message);
    return false;
  }
};

// Wait for Data Service to be ready
const waitForDataService = async () => {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/health`, { timeout: 3000 });
      if (response.status === 200) {
        console.log('✅ Data Service is ready');
        return true;
      }
    } catch (error) {
      attempts++;
      console.log(`⏳ Waiting for Data Service... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Data Service not available after maximum attempts');
};

// Start connection with health check
const startWithHealthCheck = async () => {
  const isHealthy = await checkDataServiceHealth();
  if (isHealthy) {
    connectToDataService();
  } else {
    console.log('⏳ Waiting for Data Service to be ready...');
    setTimeout(startWithHealthCheck, 5000);
  }
};

// Periodic monitoring as backup
const periodicOrderMonitoring = async () => {
  try {
    const activeStrategies = Array.from(activeGridStrategies.values());
    
    for (const strategy of activeStrategies) {
      const currentData = liveData.get(strategy.symbol);
      if (currentData && currentData.ltp && gridService) {
        await gridService.checkOrderFills(strategy.symbol, currentData.ltp);
      }
    }
  } catch (error) {
    console.error('❌ Error in periodic monitoring:', error);
  }
};

// Proxy common data requests to Data Service
app.get('/api/symbols', async (req, res) => {
  try {
    const response = await axios.get(`${DATA_SERVICE_URL}/api/symbols`);
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying symbols request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/live/:symbol?', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // First try to get from local cache
    if (symbol) {
      const symbolUpper = symbol.toUpperCase();
      const localData = liveData.get(symbolUpper);
      if (localData) {
        return res.json({ success: true, data: localData, source: 'cache' });
      }
    }
    
    // Fallback to Data Service
    const url = symbol ? 
      `${DATA_SERVICE_URL}/api/live/${symbol}` : 
      `${DATA_SERVICE_URL}/api/live`;
    
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying live data request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const queryString = new URLSearchParams(req.query).toString();
    const response = await axios.get(`${DATA_SERVICE_URL}/api/history/${symbol}?${queryString}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying history request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'grid-trading',
    port: PORT,
    activeStrategies: activeGridStrategies.size,
    dataServiceConnected: dataServiceConnected,
    liveDataCount: liveData.size,
    smartAPIInitialized: !!smartAPI,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'grid-trading',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Grid-specific routes
app.use('/api', gridRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Grid Client connected:', socket.id);
  
  // Send current status
  socket.emit('status', {
    dataServiceConnected: dataServiceConnected,
    activeStrategies: activeGridStrategies.size,
    liveDataCount: liveData.size,
    smartAPIInitialized: !!smartAPI,
    timestamp: new Date().toISOString()
  });
  
  // Send current live data if available
  if (liveData.size > 0) {
    const currentData = {};
    liveData.forEach((value, key) => {
      currentData[key] = value;
    });
    socket.emit('initial_data', { success: true, data: currentData });
  }
  
  socket.on('subscribe-strategy', (strategyId) => {
    socket.join(`grid-strategy-${strategyId}`);
    console.log(`📡 Client subscribed to grid strategy: ${strategyId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Grid Client disconnected:', socket.id);
  });
});

// Recovery function for Grid strategies
async function recoverActiveGridStrategies() {
  try {
    console.log('🔄 Recovering active Grid strategies...');
    
    const activeStrategiesFromDB = await GridStrategy.find({ status: 'ACTIVE' });
    
    for (const strategy of activeStrategiesFromDB) {
      activeGridStrategies.set(strategy.strategyId, strategy);
      console.log(`✅ Recovered Grid strategy: ${strategy.strategyId} for ${strategy.symbol}`);
      
      const orders = await GridOrder.find({ strategyId: strategy.strategyId });
      const pendingOrders = orders.filter(o => o.status === 'PENDING');
      
      if (pendingOrders.length > 0) {
        console.log(`📋 Grid Strategy ${strategy.strategyId} has ${pendingOrders.length} pending orders`);
      }
    }
    
    console.log(`✅ Recovered ${activeStrategiesFromDB.length} Grid strategy(ies)`);
  } catch (error) {
    console.error('❌ Error recovering Grid strategies:', error);
  }
}

// Connection monitoring
setInterval(() => {
  if (!dataServiceConnected && reconnectAttempts < maxReconnectAttempts) {
    console.log('⚠️ Data Service disconnected, checking health...');
    startWithHealthCheck();
  }
}, 30000); // Check every 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down Grid server...');
  
  // Disconnect from Data Service
  if (dataServiceSocket) {
    dataServiceSocket.disconnect();
  }
  
  server.close(() => {
    console.log('✅ Grid Server shut down gracefully');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  
  if (dataServiceSocket) {
    dataServiceSocket.disconnect();
  }
  
  server.close(() => {
    process.exit(0);
  });
});

// Start server with proper initialization sequence
server.listen(PORT, async () => {
  console.log(`🚀 Grid Trading Server running on port ${PORT}`);
  console.log(`📊 Data Service URL: ${DATA_SERVICE_URL}`);
  
  try {
    // Step 1: Generate tokens dynamically with delay
    await loginToSmartAPI();
    
    // Step 2: Initialize Grid Trading Service after successful login
    gridService = new GridTradingService(
      liveData, 
      activeGridStrategies, 
      emailTransporter, 
      io,
      smartAPI
    );
    
    // Step 3: Wait for Data Service to be ready
    await waitForDataService();
    
    // Step 4: Connect to Data Service
    connectToDataService();
    
    // Step 5: Recover strategies after connection is established
    setTimeout(async () => {
      await recoverActiveGridStrategies();
    }, 5000);
    
    // Step 6: Start periodic monitoring
    setInterval(periodicOrderMonitoring, 10000); // Every 10 seconds
    
  } catch (error) {
    console.error('❌ Failed to initialize Grid service:', error);
    process.exit(1);
  }
});

export { liveData, activeGridStrategies, smartAPI, emailTransporter, io };
