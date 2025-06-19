import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import WebSocket from 'ws';
import { WebSocketV2, SmartAPI } from 'smartapi-javascript';
import { authenticator } from 'otplib';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3001", // Grid service
      "http://localhost:3002", // DCA service
      "*" // Allow all for development
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Environment variables
const ANGEL_CLIENT_CODE = process.env.ANGEL_CLIENT_CODE;
const ANGEL_API_KEY = process.env.ANGEL_API_KEY;
const ANGEL_MPIN = process.env.ANGEL_MPIN;
const ANGEL_TOTP_SECRET = process.env.ANGEL_TOTP_SECRET;
const PORT = process.env.DATA_SERVICE_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store tokens in memory (will be refreshed)
let currentTokens = {
  jwtToken: null,
  refreshToken: null,
  feedToken: null,
  lastRefresh: null
};

// NIFTY 50 stocks
const NIFTY50_STOCKS = {
  "RELIANCE": "2885",
  "TCS": "11536", 
  "HDFCBANK": "1333",
  "BHARTIARTL": "10604",
  "ICICIBANK": "4963",
  "INFY": "1594",
  "SBIN": "3045",
  "LT": "11483",
  "ITC": "1660",
  "HCLTECH": "7229",
  "BAJFINANCE": "317",
  "AXISBANK": "5900",
  "ASIANPAINT": "236",
  "MARUTI": "10999",
  "SUNPHARMA": "3351",
  "TITAN": "3506",
  "ULTRACEMCO": "11532",
  "NESTLEIND": "17963",
  "WIPRO": "3787",
  "NTPC": "11630",
  "KOTAKBANK": "1922",
  "M&M": "2031",
  "HINDALCO": "1363",
  "POWERGRID": "14977",
  "TECHM": "13538",
  "TATASTEEL": "3499",
  "DIVISLAB": "10940",
  "BAJAJFINSV": "16675",
  "HDFCLIFE": "467",
  "GRASIM": "1232",
  "JSWSTEEL": "11723",
  "SBILIFE": "21808",
  "BPCL": "526",
  "CIPLA": "694",
  "DRREDDY": "881",
  "HEROMOTOCO": "1348",
  "TATACONSUM": "3432",
  "INDUSINDBK": "5258",
  "COALINDIA": "20374",
  "BAJAJ-AUTO": "16669",
  "BRITANNIA": "547",
  "EICHERMOT": "910",
  "APOLLOHOSP": "157",
  "LTIM": "17818",
  "ADANIENT": "25",
  "ONGC": "2475",
  "TATAMOTORS": "3456",
  "UPL": "11351",
  "HINDUSTANUNILEVER": "1394",
  "SHRIRAMFIN": "4306"
};

// Store live data
const liveData = new Map();
let wsConnected = false;
let lastDataReceived = null;
let connectionHealth = {
  reconnectCount: 0,
  lastError: null,
  dataReceiveCount: 0
};

// Initialize SmartAPI with dynamic token
let smartAPI = null;

// Function to generate TOTP
function generateTOTP() {
  if (!ANGEL_TOTP_SECRET) {
    throw new Error('TOTP secret not configured');
  }
  return authenticator.generate(ANGEL_TOTP_SECRET);
}

// Function to login and get fresh tokens
async function loginToSmartAPI() {
  try {
    console.log('🔐 Logging in to SmartAPI...');
    
    // Create temporary SmartAPI instance for login
    const tempSmartAPI = new SmartAPI({
      api_key: ANGEL_API_KEY
    });
    
    const totp = generateTOTP();
    console.log('🔢 Generated TOTP:', totp);
    
    // Use MPIN instead of password in generateSession
    const loginResponse = await tempSmartAPI.generateSession(
      ANGEL_CLIENT_CODE,
      ANGEL_MPIN,
      totp
    );
    
    if (loginResponse.status && loginResponse.data) {
      currentTokens = {
        jwtToken: loginResponse.data.jwtToken,
        refreshToken: loginResponse.data.refreshToken,
        feedToken: loginResponse.data.feedToken,
        lastRefresh: new Date()
      };
      
      // Update main SmartAPI instance with new tokens
      smartAPI = new SmartAPI({
        api_key: ANGEL_API_KEY,
        access_token: currentTokens.jwtToken,
        refresh_token: currentTokens.refreshToken
      });
      
      console.log('✅ Login successful, tokens refreshed');
      return currentTokens;
    } else {
      throw new Error(`Login failed: ${loginResponse.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    throw error;
  }
}

// WebSocket setup
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let reconnectTimer = null;

// Updated WebSocket setup function
async function setupWebSocket() {
  try {
    console.log('🔌 Setting up WebSocket connection...');
    
    // Ensure we have fresh tokens
    if (!currentTokens.jwtToken || !currentTokens.feedToken) {
      await loginToSmartAPI();
    }
    
    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    ws = new WebSocketV2({
      jwttoken: currentTokens.jwtToken,
      apikey: ANGEL_API_KEY,
      clientcode: ANGEL_CLIENT_CODE,
      feedtype: currentTokens.feedToken,
    });

    await ws.connect();
    console.log("✅ WebSocket Connected with fresh tokens");
    wsConnected = true;
    reconnectAttempts = 0;
    connectionHealth.reconnectCount++;
    
    // Subscribe to all NIFTY 50 tokens
    const tokens = Object.values(NIFTY50_STOCKS);
    
    ws.fetchData({
      correlationID: "nifty50_data",
      action: 1, // Subscribe
      mode: 3,   // Full mode
      exchangeType: 1, // NSE
      tokens: tokens,
    });

    // Set up event handlers
    ws.on("tick", handleLiveTick);
    ws.on("error", handleWebSocketError);
    ws.on("close", handleWebSocketClose);
    
    // Send initial status to all connected clients
    io.emit('connection_status', {
      connected: true,
      subscribedTokens: tokens.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ WebSocket connection failed:", error);
    connectionHealth.lastError = error.message;
    wsConnected = false;
    
    // If it's an authentication error, try refreshing tokens
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('🔄 Authentication error detected, refreshing tokens...');
      try {
        await loginToSmartAPI();
        scheduleReconnect();
      } catch (loginError) {
        console.error('❌ Token refresh failed:', loginError.message);
        scheduleReconnect();
      }
    } else {
      scheduleReconnect();
    }
  }
}

function handleWebSocketError(error) {
  console.error("❌ WebSocket error:", error);
  connectionHealth.lastError = error.message || error;
  wsConnected = false;
}

function handleWebSocketClose(code, reason) {
  console.log(`🔌 WebSocket connection closed: ${code} - ${reason}`);
  wsConnected = false;
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    console.log(`🔄 Scheduling reconnect attempt ${reconnectAttempts} in ${delay/1000}s`);
    
    reconnectTimer = setTimeout(async () => {
      try {
        await setupWebSocket();
      } catch (error) {
        console.error('❌ Reconnect failed:', error.message);
      }
    }, delay);
  } else {
    console.error("❌ Max reconnection attempts reached. Manual restart required.");
    // Notify all clients about connection failure
    io.emit('connection_status', {
      connected: false,
      error: 'Max reconnection attempts reached',
      timestamp: new Date().toISOString()
    });
  }
}

// Add WebSocket server alongside Socket.IO
const wss = new WebSocket.Server({ 
  server: server,
  path: '/ws' 
});

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  
  // Send current live data immediately
  const currentData = {};
  liveData.forEach((value, key) => {
    currentData[key] = value;
  });
  
  if (Object.keys(currentData).length > 0) {
    ws.send(JSON.stringify({
      type: 'initial_data',
      data: currentData
    }));
  }
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket client error:', error);
  });
});

function handleLiveTick(data) {
  if (!data || data === "pong") return;
  
  lastDataReceived = Date.now();
  connectionHealth.dataReceiveCount++;
  
  try {
    // Handle both single tick and array of ticks
    const ticks = Array.isArray(data) ? data : [data];
    
    let processedCount = 0;
    
    ticks.forEach((tick) => {
      try {
        // Clean and normalize token
        let token = String(tick.token || tick.symbolToken || '').replace(/"/g, "").trim();
        
        // Find matching symbol
        const stockSymbol = Object.keys(NIFTY50_STOCKS).find(
          symbol => NIFTY50_STOCKS[symbol] === token
        );
        
        if (!stockSymbol) return;
        
        // Parse price data - handle different field names and divide by 100 if needed
        const ltp = parseFloat(tick.last_traded_price || tick.ltp || tick.lastTradedPrice || 0);
        const open = parseFloat(tick.open_price_of_the_day || tick.open || tick.openPrice || ltp);
        const high = parseFloat(tick.high_price_of_the_day || tick.high || tick.highPrice || ltp);
        const low = parseFloat(tick.low_price_of_the_day || tick.low || tick.lowPrice || ltp);
        const close = parseFloat(tick.close_price || tick.prev_close || tick.previousClose || ltp);
        
        // Check if prices need to be divided by 100 (common in some feeds)
        const finalLtp = ltp > 10000 ? ltp / 100 : ltp;
        const finalOpen = open > 10000 ? open / 100 : open;
        const finalHigh = high > 10000 ? high / 100 : high;
        const finalLow = low > 10000 ? low / 100 : low;
        const finalClose = close > 10000 ? close / 100 : close;
        
        if (finalLtp <= 0) return;
        
        // Calculate change
        const change = finalClose > 0 ? finalLtp - finalClose : 0;
        const changePercent = finalClose > 0 ? ((change / finalClose) * 100) : 0;
        
        const processedData = {
          symbol: stockSymbol,
          token: token,
          timestamp: new Date().toISOString(),
          ltp: finalLtp,
          open: finalOpen,
          high: finalHigh,
          low: finalLow,
          close: finalClose,
          volume: parseInt(tick.volume_trade_for_the_day || tick.volume || tick.totalTradedVolume || 0),
          change: change,
          changePercent: parseFloat(changePercent.toFixed(2)),
          rawTick: tick // Keep raw data for debugging
        };
        
        // Store in memory
        liveData.set(stockSymbol, processedData);
        processedCount++;
        
        // Broadcast to Socket.IO clients
        io.emit('live_data', {
          success: true,
          data: processedData
        });
        
        // Broadcast to WebSocket clients
        const message = JSON.stringify({
          type: 'live_data',
          data: processedData
        });
        
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
        
      } catch (error) {
        console.error("❌ Error processing individual tick:", error);
      }
    });
    
  } catch (error) {
    console.error("❌ Error processing tick data:", error);
  }
}

// Enhanced historical data function with better error handling
async function getHistoricalData(symbol, interval = "ONE_DAY", fromDate, toDate) {
  try {
    const token = NIFTY50_STOCKS[symbol];
    if (!token) {
      throw new Error(`Token not found for symbol: ${symbol}`);
    }

    if (!fromDate) {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30); // Last 30 days instead of 6 months
    }
    if (!toDate) {
      toDate = new Date();
    }

    const formatDate = (date) => {
      return date.toISOString().split('T')[0] + ' 09:15';
    };

    const params = {
      exchange: "NSE",
      symboltoken: token,
      interval: interval,
      fromdate: formatDate(fromDate),
      todate: formatDate(toDate)
    };

    const response = await smartAPI.getCandleData(params);
    
    if (response.status && response.data && Array.isArray(response.data)) {
      const candleData = response.data.map(candle => ({
        timestamp: new Date(candle[0]).toISOString(),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseInt(candle[5])
      }));

      return candleData;
    } else {
      throw new Error(`API Error: ${response.message || response.errorMessage || 'Unknown error'}`);
    }

  } catch (error) {
    console.error(`❌ Error fetching historical data for ${symbol}:`, error.message);
    throw error;
  }
}

// Token refresh scheduler - refresh before 5 AM daily
function scheduleTokenRefresh() {
  const now = new Date();
  const tomorrow5AM = new Date();
  tomorrow5AM.setDate(tomorrow5AM.getDate() + 1);
  tomorrow5AM.setHours(4, 45, 0, 0); // Refresh at 4:45 AM, 15 minutes before expiry
  
  const timeUntilRefresh = tomorrow5AM.getTime() - now.getTime();
  
  setTimeout(async () => {
    console.log('⏰ Scheduled token refresh triggered');
    try {
      await loginToSmartAPI();
      if (wsConnected) {
        // Reconnect WebSocket with new tokens
        if (ws) {
          ws.close();
        }
        setupWebSocket();
      }
      // Schedule next refresh
      scheduleTokenRefresh();
    } catch (error) {
      console.error('❌ Scheduled token refresh failed:', error.message);
    }
  }, timeUntilRefresh);
  
  console.log(`⏰ Next token refresh scheduled for: ${tomorrow5AM.toISOString()}`);
}

// API Routes

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: {
      websocket: wsConnected,
      liveDataCount: liveData.size,
      totalSymbols: Object.keys(NIFTY50_STOCKS).length,
      lastDataReceived: lastDataReceived ? new Date(lastDataReceived).toISOString() : null,
      timeSinceLastData: lastDataReceived ? Date.now() - lastDataReceived : null,
      uptime: process.uptime(),
      connectionHealth: connectionHealth,
      tokensStatus: {
        hasJwtToken: !!currentTokens.jwtToken,
        hasFeedToken: !!currentTokens.feedToken,
        lastRefresh: currentTokens.lastRefresh
      }
    }
  });
});

// Add health check endpoint for other services
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'data-service',
    port: PORT,
    timestamp: new Date().toISOString(),
    websocket: wsConnected ? 'connected' : 'disconnected',
    smartapi: currentTokens.jwtToken ? 'authenticated' : 'not authenticated'
  });
});

// Get all symbols with enhanced status
app.get('/api/symbols', (req, res) => {
  const symbols = Object.keys(NIFTY50_STOCKS).map(symbol => ({
    symbol: symbol,
    token: NIFTY50_STOCKS[symbol],
    liveData: liveData.get(symbol) || null,
    hasLiveData: liveData.has(symbol),
    lastUpdate: liveData.get(symbol)?.timestamp || null
  }));
  
  const liveSymbols = symbols.filter(s => s.hasLiveData);
  
  res.json({
    success: true,
    totalSymbols: symbols.length,
    liveDataCount: liveSymbols.length,
    websocketStatus: wsConnected,
    data: symbols,
    summary: {
      withLiveData: liveSymbols.length,
      withoutLiveData: symbols.length - liveSymbols.length
    }
  });
});

// Enhanced live data endpoint with better fallback
app.get('/api/live/:symbol?', async (req, res) => {
  const { symbol } = req.params;
  
  if (symbol) {
    const symbolUpper = symbol.toUpperCase();
    let data = liveData.get(symbolUpper);
    
    if (!data) {
      // Try historical data fallback with shorter timeframe
      try {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 5); // Last 5 days
        
        const historicalData = await getHistoricalData(symbolUpper, "FIVE_MINUTE", fromDate);
        if (historicalData && historicalData.length > 0) {
          const latest = historicalData[historicalData.length - 1];
          data = {
            symbol: symbolUpper,
            token: NIFTY50_STOCKS[symbolUpper],
            timestamp: latest.timestamp,
            ltp: latest.close,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            volume: latest.volume,
            change: 0,
            changePercent: 0,
            source: 'historical_fallback'
          };
        }
      } catch (error) {
        // Silent fallback failure
      }
    }
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: `No data available for symbol: ${symbolUpper}`,
        websocketStatus: wsConnected,
        totalLiveData: liveData.size,
        suggestions: [
          'Check if WebSocket is connected',
          'Verify symbol is in NIFTY 50 list',
          'Wait for live data to be received'
        ]
      });
    }
    
    return res.json({
      success: true,
      data: data
    });
  }
  
  // Return all live data
  const allData = {};
  liveData.forEach((value, key) => {
    allData[key] = value;
  });
  
  res.json({
    success: true,
    count: Object.keys(allData).length,
    websocketStatus: wsConnected,
    lastDataReceived: lastDataReceived ? new Date(lastDataReceived).toISOString() : null,
    data: allData
  });
});

// Enhanced historical data endpoint
app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { fromDate, toDate, interval = 'ONE_DAY' } = req.query;
    
    const symbolUpper = symbol.toUpperCase();
    
    if (!NIFTY50_STOCKS[symbolUpper]) {
      return res.status(404).json({
        success: false,
        message: `Symbol not found: ${symbolUpper}`,
        availableSymbols: Object.keys(NIFTY50_STOCKS)
      });
    }
    
    const startDate = fromDate ? new Date(fromDate) : (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30); // Default to 30 days
      return date;
    })();
    
    const endDate = toDate ? new Date(toDate) : new Date();
    
    const data = await getHistoricalData(symbolUpper, interval, startDate, endDate);
    
    res.json({
      success: true,
      symbol: symbolUpper,
      interval: interval,
      fromDate: startDate.toISOString(),
      toDate: endDate.toISOString(),
      count: data.length,
      data: data
    });
    
  } catch (error) {
    console.error('Historical data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch historical data: ' + error.message,
      suggestions: [
        'Check if symbol exists',
        'Verify date range is valid',
        'Try different interval',
        'Check API limits'
      ]
    });
  }
});

// Debug endpoint for raw WebSocket status
app.get('/api/debug', (req, res) => {
  res.json({
    websocket: {
      connected: wsConnected,
      reconnectAttempts: reconnectAttempts,
      maxReconnectAttempts: maxReconnectAttempts,
      connectionHealth: connectionHealth
    },
    environment: {
      hasApiKey: !!ANGEL_API_KEY,
      hasClientCode: !!ANGEL_CLIENT_CODE,
      hasMpin: !!ANGEL_MPIN,
      hasTotpSecret: !!ANGEL_TOTP_SECRET
    },
    tokens: {
      hasJwtToken: !!currentTokens.jwtToken,
      hasFeedToken: !!currentTokens.feedToken,
      hasRefreshToken: !!currentTokens.refreshToken,
      lastRefresh: currentTokens.lastRefresh
    },
    liveData: {
      totalSymbols: Object.keys(NIFTY50_STOCKS).length,
      liveDataCount: liveData.size,
      symbols: Array.from(liveData.keys()),
      lastDataReceived: lastDataReceived ? new Date(lastDataReceived).toISOString() : null
    }
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Send current status
  socket.emit('status', {
    websocketConnected: wsConnected,
    liveDataCount: liveData.size,
    availableSymbols: Object.keys(NIFTY50_STOCKS).length,
    lastDataReceived: lastDataReceived ? new Date(lastDataReceived).toISOString() : null
  });
  
  // Send current live data
  const currentData = {};
  liveData.forEach((value, key) => {
    currentData[key] = value;
  });
  
  if (Object.keys(currentData).length > 0) {
    socket.emit('initial_data', {
      success: true,
      data: currentData
    });
  }
  
  socket.on('disconnect', () => {
    // Silent disconnect
  });
  
  // Handle manual reconnect request
  socket.on('reconnect_websocket', async () => {
    if (!wsConnected) {
      reconnectAttempts = 0; // Reset attempts
      await setupWebSocket();
    }
  });
});

// Periodic health check and auto-recovery
setInterval(async () => {
  const timeSinceLastData = lastDataReceived ? Date.now() - lastDataReceived : null;
  
  // If no data received for 2 minutes and WebSocket claims to be connected, try reconnecting
  if (wsConnected && timeSinceLastData && timeSinceLastData > 120000) {
    console.log('⚠️ No data received for 2 minutes, attempting reconnection');
    wsConnected = false;
    if (ws) {
      try {
        ws.close();
      } catch (e) {
        // Silent error
      }
    }
    await setupWebSocket();
  }
}, 30000); // Check every 30 seconds

// Start the application
async function startApplication() {
  try {
    // Fixed validation - use MPIN instead of PASSWORD
    if (!ANGEL_CLIENT_CODE || !ANGEL_API_KEY || !ANGEL_MPIN || !ANGEL_TOTP_SECRET) {
      throw new Error('Missing required environment variables: CLIENT_CODE, API_KEY, MPIN, or TOTP_SECRET');
    }
    
    // Initial login
    await loginToSmartAPI();
    
    // Setup WebSocket
    await setupWebSocket();
    
    // Schedule daily token refresh
    scheduleTokenRefresh();
    
    console.log('🚀 Application started successfully');
  } catch (error) {
    console.error('❌ Failed to start application:', error.message);
    process.exit(1);
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`📊 Data Service running on port ${PORT}`);
  startApplication();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Shutting down gracefully...');
  if (ws) {
    ws.close();
  }
  server.close(() => {
    console.log('📴 Server closed');
    process.exit(0);
  });
});

export { liveData, smartAPI, io };
