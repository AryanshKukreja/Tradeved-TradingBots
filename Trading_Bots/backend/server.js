import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { WebSocketV2, SmartAPI } from 'smartapi-javascript';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

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
const ANGEL_JWT_TOKEN = process.env.ANGEL_JWT_TOKEN?.trim();
const ANGEL_REFRESH_TOKEN = process.env.ANGEL_REFRESH_TOKEN?.trim();
const ANGEL_FEED_TOKEN = process.env.ANGEL_FEED_TOKEN?.trim();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/grid_trading';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// MongoDB Schemas

const DCAOrderSchema = new mongoose.Schema({
  strategyId: { type: String, required: true },
  symbol: { type: String, required: true },
  orderId: { type: String, unique: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  amount: { type: Number, required: true }, // price * quantity
  status: { type: String, enum: ['PENDING', 'EXECUTED', 'CANCELLED'], default: 'PENDING' },
  scheduledTime: { type: Date, required: true },
  timestamp: { type: Date, default: Date.now },
  fillPrice: { type: Number, default: null },
  fillTime: { type: Date, default: null },
  orderNumber: { type: Number, required: true } // 1st order, 2nd order, etc.
});

const DCAStrategySchema = new mongoose.Schema({
  strategyId: { type: String, unique: true, required: true },
  symbol: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'STOPPED', 'COMPLETED'], default: 'STOPPED' },
  config: {
    investmentAmount: { type: Number, required: true },
    frequency: { type: Number, required: true }, // in hours or days
    frequencyUnit: { type: String, enum: ['hours', 'days'], required: true },
    startTime: { type: Date, required: true },
    endCondition: { type: String, enum: ['orderCount', 'stopLoss', 'takeProfit', 'manual'], required: true },
    maxOrders: { type: Number, default: 0 },
    stopLoss: { type: Number, default: 0 }, // percentage
    takeProfit: { type: Number, default: 0 }, // percentage
    orderType: { type: String, enum: ['BUY', 'SELL'], default: 'BUY' },
    enableStopLoss: { type: Boolean, default: false },
    enableTakeProfit: { type: Boolean, default: false }
  },
  monitoring: {
    totalPnL: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    executedOrders: { type: Number, default: 0 },
    pendingOrders: { type: Number, default: 0 },
    totalInvestment: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    averagePrice: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    startTime: { type: Date, default: Date.now },
    lastUpdate: { type: Date, default: Date.now },
    nextOrderTime: { type: Date, default: null },
    userEmail: { type: String, default: '' },
    emailNotifications: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  strategyId: { type: String, required: true },
  symbol: { type: String, required: true },
  orderId: { type: String, unique: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'FILLED', 'CANCELLED'], default: 'PENDING' },
  gridLevel: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  fillPrice: { type: Number, default: null },
  fillQuantity: { type: Number, default: 0 },
  fillTime: { type: Date, default: null },
  pnl: { type: Number, default: 0 },
  takeProfitPrice: { type: Number, default: null }
});

const StrategySchema = new mongoose.Schema({
  strategyId: { type: String, unique: true, required: true },
  symbol: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'STOPPED', 'COMPLETED'], default: 'STOPPED' },
  config: {
    gridType: { type: String, enum: ['Arithmetic', 'Geometric'], required: true },
    upperPrice: { type: Number, required: true },
    lowerPrice: { type: Number, required: true },
    levels: { type: Number, required: true },
    investment: { type: Number, required: true },
    qtyPerOrder: { type: Number, default: 0 },
    useTrigger: { type: Boolean, default: false },
    triggerPrice: { type: Number, default: 0 },
    stopLoss: { type: Number, default: 0 },
    takeProfit: { type: Number, default: 0 },
    mode: { type: String, enum: ['Neutral', 'Long', 'Short'], default: 'Neutral' },
    entryCondition: { type: String, enum: ['Crossing', 'Pullback'], default: 'Crossing' },
    targetMethod: { type: String, enum: ['Exchange', 'Increased Average Tp'], default: 'Exchange' }
  },
  gridLevels: [{ type: Number }],
  monitoring: {
    totalPnL: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    filledOrders: { type: Number, default: 0 },
    pendingOrders: { type: Number, default: 0 },
    totalInvestment: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    startTime: { type: Date, default: Date.now },
    lastUpdate: { type: Date, default: Date.now }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const BacktestResultSchema = new mongoose.Schema({
  strategyId: { type: String, required: true },
  symbol: { type: String, required: true },
  config: { type: Object, required: true },
  results: {
    totalTrades: { type: Number, default: 0 },
    winningTrades: { type: Number, default: 0 },
    losingTrades: { type: Number, default: 0 },
    totalPnL: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    maxDrawdown: { type: Number, default: 0 },
    sharpeRatio: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 }
  },
  trades: [{
    type: { type: String, enum: ['BUY', 'SELL'] },
    price: { type: Number },
    quantity: { type: Number },
    timestamp: { type: Date },
    pnl: { type: Number }
  }],
  period: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Models
const Order = mongoose.model('Order', OrderSchema);
const Strategy = mongoose.model('Strategy', StrategySchema);
const BacktestResult = mongoose.model('BacktestResult', BacktestResultSchema);
const DCAOrder = mongoose.model('DCAOrder', DCAOrderSchema);
const DCAStrategy = mongoose.model('DCAStrategy', DCAStrategySchema);

// NIFTY 50 stocks with their Angel One tokens
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

// Store live data and active strategies
const liveData = new Map();
const activeStrategies = new Map();

// Initialize SmartAPI
const smartAPI = new SmartAPI({
  api_key: ANGEL_API_KEY,
  access_token: ANGEL_JWT_TOKEN,
  refresh_token: ANGEL_REFRESH_TOKEN
});

// Email configuration
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'kukrejaaryansh297@gmail.com',
    pass: 'ibpyigpdtaibqlvw' // Use App Password for better security
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email connection on startup
emailTransporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Enhanced email notification function
async function sendEmailNotification(order, strategy) {
  try {
    const userEmail = strategy.monitoring?.userEmail || 'kukrejaaryansh297@gmail.com';
    
    const mailOptions = {
      from: 'kukrejaaryansh297@gmail.com',
      to: userEmail,
      subject: `🚀 Grid Trading Alert - ${order.type} Order Executed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00D4AA;">🚀 Grid Trading Order Executed</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Strategy ID:</td>
                <td style="padding: 8px;">${strategy.strategyId}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Symbol:</td>
                <td style="padding: 8px;">${order.symbol}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Order Type:</td>
                <td style="padding: 8px; color: ${order.type === 'BUY' ? '#00D4AA' : '#FF6B6B'};">
                  <strong>${order.type}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Quantity:</td>
                <td style="padding: 8px;">${order.quantity}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Execution Price:</td>
                <td style="padding: 8px;"><strong>₹${order.fillPrice}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Target Price:</td>
                <td style="padding: 8px;">₹${order.price}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Grid Level:</td>
                <td style="padding: 8px;">Level ${order.gridLevel}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">P&L:</td>
                <td style="padding: 8px; color: ${order.pnl >= 0 ? '#00D4AA' : '#FF6B6B'};">
                  <strong>${order.pnl >= 0 ? '+' : ''}₹${order.pnl.toFixed(2)}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Execution Time:</td>
                <td style="padding: 8px;">${new Date(order.fillTime).toLocaleString()}</td>
              </tr>
            </table>
          </div>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0; color: #2d5a2d;">Strategy Performance</h3>
            <p><strong>Total P&L:</strong> ₹${strategy.monitoring.totalPnL.toFixed(2)}</p>
            <p><strong>ROI:</strong> ${strategy.monitoring.roi.toFixed(2)}%</p>
            <p><strong>Filled Orders:</strong> ${strategy.monitoring.filledOrders}</p>
            <p><strong>Pending Orders:</strong> ${strategy.monitoring.pendingOrders}</p>
          </div>
          <p style="color: #666; font-size: 12px;">
            This is an automated notification from your Grid Trading System.
          </p>
        </div>
      `
    };
    
    await emailTransporter.sendMail(mailOptions);
    console.log(`📧 Email notification sent to ${userEmail}`);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}


// Add this function after your existing utility functions
async function enforceStrategySingletonLimit() {
  try {
    const activeStrategiesFromDB = await Strategy.find({ status: 'ACTIVE' });
    
    if (activeStrategiesFromDB.length > 1) {
      console.log(`⚠️ Found ${activeStrategiesFromDB.length} active strategies. Stopping all except the most recent.`);
      
      // Sort by creation date and keep only the most recent
      const sortedStrategies = activeStrategiesFromDB.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const mostRecentStrategy = sortedStrategies[0];
      
      // Stop all other strategies
      for (let i = 1; i < sortedStrategies.length; i++) {
        const strategy = sortedStrategies[i];
        strategy.status = 'STOPPED';
        await strategy.save();
        
        // Cancel pending orders
        await Order.updateMany(
          { strategyId: strategy.strategyId, status: 'PENDING' },
          { status: 'CANCELLED' }
        );
        
        // Remove from the global activeStrategies Map (not the array)
        activeStrategies.delete(strategy.strategyId); // This is the correct Map variable
        
        console.log(`🛑 Stopped strategy: ${strategy.strategyId}`);
      }
      
      console.log(`✅ Kept active strategy: ${mostRecentStrategy.strategyId}`);
    }
  } catch (error) {
    console.error('❌ Error enforcing strategy singleton limit:', error);
  }
}


// Add this function after your models are defined
// Replace the existing recoverActiveStrategies function
async function recoverActiveStrategies() {
  try {
    console.log('🔄 Recovering active strategies...');
    
    // First enforce the singleton limit
    await enforceStrategySingletonLimit();
    
    const activeStrategiesFromDB = await Strategy.find({ status: 'ACTIVE' });
    
    if (activeStrategiesFromDB.length > 1) {
      console.log('⚠️ Multiple active strategies found after cleanup. This should not happen.');
      return;
    }
    
    for (const strategy of activeStrategiesFromDB) {
      activeStrategies.set(strategy.strategyId, strategy);
      console.log(`✅ Recovered strategy: ${strategy.strategyId} for ${strategy.symbol}`);
      
      // Send recovery notification
      const orders = await Order.find({ strategyId: strategy.strategyId });
      const pendingOrders = orders.filter(o => o.status === 'PENDING');
      
      if (pendingOrders.length > 0) {
        console.log(`📋 Strategy ${strategy.strategyId} has ${pendingOrders.length} pending orders`);
      }
    }
    
    console.log(`✅ Recovered ${activeStrategiesFromDB.length} active strategy(ies)`);
  } catch (error) {
    console.error('❌ Error recovering strategies:', error);
  }
}


// Call this function when server starts
// Update the server.listen section
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await recoverActiveStrategies(); // This now includes singleton enforcement
  setupWebSocket();
  
  // Start periodic cleanup
  setInterval(async () => {
    try {
      await enforceStrategySingletonLimit();
    } catch (error) {
      console.error('❌ Error in periodic strategy cleanup:', error);
    }
  }, 60000);
});



// WebSocket setup
let ws = null;

function setupWebSocket() {
  try {
    ws = new WebSocketV2({
      jwttoken: ANGEL_JWT_TOKEN,
      apikey: ANGEL_API_KEY,
      clientcode: ANGEL_CLIENT_CODE,
      feedtype: ANGEL_FEED_TOKEN,
    });

    ws.connect()
      .then(() => {
        console.log("🔌 WebSocket Connected for Live Data");
        
        const tokens = Object.values(NIFTY50_STOCKS);
        
        ws.fetchData({
          correlationID: "nifty50_live",
          action: 1,
          mode: 3,
          exchangeType: 1,
          tokens: tokens,
        });

        ws.on("tick", handleLiveTick);
      })
      .catch((err) => {
        console.error("❌ WebSocket connection failed:", err);
        setTimeout(setupWebSocket, 5000);
      });

  } catch (error) {
    console.error("❌ Error setting up WebSocket:", error);
    setTimeout(setupWebSocket, 5000);
  }
}

function handleLiveTick(data) {
  if (data === "pong") return;
  
  const ticks = Array.isArray(data) ? data : [data];
  
  ticks.forEach(tick => {
    try {
      const token = String(tick.token).replace(/"/g, "").trim();
      
      const stockSymbol = Object.keys(NIFTY50_STOCKS).find(
        symbol => NIFTY50_STOCKS[symbol] === token
      );
      
      if (!stockSymbol) return;
      
      const processedData = {
        symbol: stockSymbol,
        token: token,
        timestamp: new Date().toISOString(),
        ltp: parseFloat(tick.last_traded_price) / 100,
        open: parseFloat(tick.open_price_of_the_day || tick.ltp) / 100,
        high: parseFloat(tick.high_price_of_the_day || tick.ltp) / 100,
        low: parseFloat(tick.low_price_of_the_day || tick.ltp) / 100,
        close: parseFloat(tick.close_price || tick.ltp) / 100,
        volume: parseInt(tick.volume_trade_for_the_day) || 0,
        change: parseFloat(tick.net_change_indicator === '+' ? tick.net_change : -tick.net_change) / 100 || 0,
        changePercent: parseFloat(tick.exchange_timestamp) || 0
      };
      
      liveData.set(stockSymbol, processedData);
      
      // Check for order fills in active strategies
      checkOrderFills(stockSymbol, processedData.ltp);
      
      io.emit('live_data', {
        success: true,
        data: processedData
      });
      
    } catch (error) {
      console.error("❌ Error processing tick:", error);
    }
  });
}

// Utility Functions
const generateStrategyId = () => {
  return `GRID_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Fixed Grid Level Calculation
const calculateGridLevels = (config) => {
  const levels = [];
  const { gridType, upperPrice, lowerPrice, levels: numLevels, mode } = config;

  if (numLevels > 0 && upperPrice > lowerPrice) {
    if (gridType === 'Arithmetic') {
      const step = (upperPrice - lowerPrice) / (numLevels + 1);
      for (let i = 1; i <= numLevels; i++) {
        levels.push(parseFloat((lowerPrice + i * step).toFixed(2)));
      }
    } else {
      const factor = Math.pow(upperPrice / lowerPrice, 1 / (numLevels + 1));
      for (let i = 1; i <= numLevels; i++) {
        levels.push(parseFloat((lowerPrice * Math.pow(factor, i)).toFixed(2)));
      }
    }
  }
  return levels.sort((a, b) => a - b);
};

const calculateQuantityPerLevel = (config, currentPrice) => {
  if (config.qtyPerOrder > 0) {
    return config.qtyPerOrder;
  }
  
  // Calculate based on investment and levels
  const investmentPerLevel = config.investment / config.levels;
  const avgPrice = currentPrice || (config.upperPrice + config.lowerPrice) / 2;
  return parseFloat((investmentPerLevel / avgPrice).toFixed(4));
};

// Automatic Order Fill Logic
async function checkOrderFills(symbol, currentPrice) {
  try {
    const activeStrategiesForSymbol = await Strategy.find({
      symbol: symbol,
      status: 'ACTIVE'
    });

    for (const strategy of activeStrategiesForSymbol) {
      const pendingOrders = await Order.find({
        strategyId: strategy.strategyId,
        status: 'PENDING'
      });

      for (const order of pendingOrders) {
        const tolerance = order.price * 0.001; // 0.1% tolerance
        
        // Check if order should be filled
        let shouldFill = false;
        
        if (order.type === 'BUY' && currentPrice <= (order.price + tolerance)) {
          shouldFill = true;
        } else if (order.type === 'SELL' && currentPrice >= (order.price - tolerance)) {
          shouldFill = true;
        }

        if (shouldFill) {
          await fillOrder(order, currentPrice, strategy);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking order fills:', error);
  }
}

async function fillOrder(order, fillPrice, strategy) {
  try {
    // Update order
    order.status = 'FILLED';
    order.fillPrice = fillPrice;
    order.fillTime = new Date();
    order.fillQuantity = order.quantity;
    
    // Calculate P&L
    if (order.type === 'BUY') {
      order.pnl = 0; // P&L calculated on sell
    } else {
      // Find corresponding buy order for P&L calculation
      const buyOrders = await Order.find({
        strategyId: order.strategyId,
        type: 'BUY',
        status: 'FILLED'
      }).sort({ fillTime: 1 });
      
      if (buyOrders.length > 0) {
        const buyOrder = buyOrders[0]; // FIFO
        order.pnl = (fillPrice - buyOrder.fillPrice) * order.quantity;
      }
    }
    
    await order.save();
    
    console.log(`✅ Order filled: ${order.type} ${order.symbol} at ₹${fillPrice} (Target: ₹${order.price})`);
    
    // Create next grid order if needed
    await createNextGridOrder(order, strategy);
    
    // Update monitoring
    await updateMonitoringData(order.strategyId);
    
    // Send email notification
    await sendEmailNotification(order, strategy);
    
    // Emit real-time update
    emitStrategyUpdate(order.strategyId, {
      type: 'order_filled',
      order: order
    });
    
  } catch (error) {
    console.error('❌ Error filling order:', error);
  }
}

async function createNextGridOrder(filledOrder, strategy) {
  try {
    const { gridLevels, config } = strategy;
    const currentPrice = liveData.get(filledOrder.symbol)?.ltp || filledOrder.fillPrice;
    const qtyPerLevel = calculateQuantityPerLevel(config, currentPrice);
    
    // Create opposite order at the same level for grid trading
    const nextOrderType = filledOrder.type === 'BUY' ? 'SELL' : 'BUY';
    const nextPrice = filledOrder.type === 'BUY' ? 
      filledOrder.fillPrice * 1.02 : // 2% above buy price for sell
      filledOrder.fillPrice * 0.98;   // 2% below sell price for buy
    
    const orderId = `${filledOrder.strategyId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const nextOrder = new Order({
      strategyId: filledOrder.strategyId,
      symbol: filledOrder.symbol,
      orderId,
      type: nextOrderType,
      price: parseFloat(nextPrice.toFixed(2)),
      quantity: qtyPerLevel,
      gridLevel: filledOrder.gridLevel,
      status: 'PENDING'
    });
    
    await nextOrder.save();
    console.log(`📝 Created next grid order: ${nextOrderType} at ₹${nextPrice.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error creating next grid order:', error);
  }
}

async function createGridOrders(strategy) {
  const { strategyId, symbol, config, gridLevels } = strategy;
  const livePrice = liveData.get(symbol);
  const currentPrice = livePrice ? livePrice.ltp : (config.upperPrice + config.lowerPrice) / 2;
  const qtyPerLevel = calculateQuantityPerLevel(config, currentPrice);
  
  // Clear existing orders
  await Order.deleteMany({ strategyId });
  
  const orders = [];
  
  // Create orders based on mode
  for (let i = 0; i < gridLevels.length; i++) {
    const price = gridLevels[i];
    const orderId = `${strategyId}_${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let orderType;
    
    // Determine order type based on mode and price relative to current
    if (config.mode === 'Neutral') {
      if (price < currentPrice * 0.999) {
        orderType = 'BUY';
      } else if (price > currentPrice * 1.001) {
        orderType = 'SELL';
      } else {
        continue; // Skip orders too close to current price
      }
    } else if (config.mode === 'Long') {
      if (price < currentPrice * 0.999) {
        orderType = 'BUY';
      } else {
        continue;
      }
    } else if (config.mode === 'Short') {
      if (price > currentPrice * 1.001) {
        orderType = 'SELL';
      } else {
        continue;
      }
    }
    
    const order = new Order({
      strategyId,
      symbol: symbol,
      orderId,
      type: orderType,
      price,
      quantity: qtyPerLevel,
      gridLevel: i + 1,
      status: 'PENDING'
    });
    
    orders.push(order);
  }
  
  if (orders.length > 0) {
    await Order.insertMany(orders);
    console.log(`✅ Created ${orders.length} grid orders for strategy ${strategyId}`);
  }
  
  // Store strategy in active strategies map
  activeStrategies.set(strategyId, strategy);
}

async function updateMonitoringData(strategyId) {
  try {
    const orders = await Order.find({ strategyId });
    const strategy = await Strategy.findOne({ strategyId });
    
    if (!strategy) return;
    
    const filledOrders = orders.filter(o => o.status === 'FILLED').length;
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
    const totalPnL = orders.reduce((sum, order) => sum + (order.pnl || 0), 0);
    const currentValue = strategy.monitoring.totalInvestment + totalPnL;
    const roi = strategy.monitoring.totalInvestment > 0 ? 
      (totalPnL / strategy.monitoring.totalInvestment) * 100 : 0;
    
    strategy.monitoring = {
      ...strategy.monitoring.toObject(),
      totalPnL,
      roi,
      filledOrders,
      pendingOrders,
      currentValue,
      lastUpdate: new Date()
    };
    
    await strategy.save();
    
    // Emit monitoring update
    emitStrategyUpdate(strategyId, {
      type: 'monitoring_update',
      monitoring: strategy.monitoring
    });
    
  } catch (error) {
    console.error('❌ Error updating monitoring data:', error);
  }
}
// Historical data function
async function getHistoricalData(symbol, interval = "ONE_DAY", fromDate, toDate) {
  try {
    const token = NIFTY50_STOCKS[symbol];
    if (!token) {
      throw new Error(`Token not found for symbol: ${symbol}`);
    }

    if (!fromDate) {
      fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 6);
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
    
    if (response.status && response.data) {
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
      throw new Error(`API Error: ${response.message || 'Unknown error'}`);
    }

  } catch (error) {
    console.error(`❌ Error fetching historical data for ${symbol}:`, error);
    throw error;
  }
}

// Enhanced Backtest function
async function performBacktest(strategyId, symbol, config, historicalData, period) {
  try {
    const gridLevels = calculateGridLevels(config);
    const trades = [];
    const positions = new Map();
    let totalPnL = 0;
    let totalInvestment = config.investment;
    let maxDrawdown = 0;
    let currentDrawdown = 0;
    let peakValue = totalInvestment;
    let winningTrades = 0;
    let losingTrades = 0;
    
    console.log(`🔄 Starting backtest for ${symbol} with ${gridLevels.length} grid levels`);
    
    for (let dataIndex = 0; dataIndex < historicalData.length; dataIndex++) {
      const dataPoint = historicalData[dataIndex];
      const currentPrice = dataPoint.close;
      
      // Check each grid level for potential trades
      for (let i = 0; i < gridLevels.length; i++) {
        const gridPrice = gridLevels[i];
        const tolerance = gridPrice * 0.002; // 0.2% tolerance
        
        // Check if price hits this grid level
        if (Math.abs(currentPrice - gridPrice) <= tolerance) {
          const qtyPerLevel = calculateQuantityPerLevel(config, currentPrice);
          
          // Determine trade type based on mode and grid position
          if (config.mode === 'Neutral' || config.mode === 'Long') {
            // Buy at lower levels
            if (gridPrice < currentPrice && !positions.has(`buy_${i}`)) {
              const trade = {
                type: 'BUY',
                price: gridPrice,
                quantity: qtyPerLevel,
                timestamp: new Date(dataPoint.timestamp),
                pnl: 0,
                gridLevel: i + 1
              };
              
              trades.push(trade);
              positions.set(`buy_${i}`, { price: gridPrice, quantity: qtyPerLevel, timestamp: dataPoint.timestamp });
            }
            
            // Sell at higher levels if we have a buy position
            if (gridPrice > currentPrice && positions.has(`buy_${i-1}`)) {
              const buyPosition = positions.get(`buy_${i-1}`);
              const pnl = (gridPrice - buyPosition.price) * buyPosition.quantity;
              
              const trade = {
                type: 'SELL',
                price: gridPrice,
                quantity: buyPosition.quantity,
                timestamp: new Date(dataPoint.timestamp),
                pnl: pnl,
                gridLevel: i + 1
              };
              
              trades.push(trade);
              positions.delete(`buy_${i-1}`);
              
              totalPnL += pnl;
              if (pnl > 0) winningTrades++;
              else losingTrades++;
            }
          }
          
          if (config.mode === 'Neutral' || config.mode === 'Short') {
            // Sell at higher levels
            if (gridPrice > currentPrice && !positions.has(`sell_${i}`)) {
              const trade = {
                type: 'SELL',
                price: gridPrice,
                quantity: qtyPerLevel,
                timestamp: new Date(dataPoint.timestamp),
                pnl: 0,
                gridLevel: i + 1
              };
              
              trades.push(trade);
              positions.set(`sell_${i}`, { price: gridPrice, quantity: qtyPerLevel, timestamp: dataPoint.timestamp });
            }
            
            // Buy to cover at lower levels if we have a sell position
            if (gridPrice < currentPrice && positions.has(`sell_${i+1}`)) {
              const sellPosition = positions.get(`sell_${i+1}`);
              const pnl = (sellPosition.price - gridPrice) * sellPosition.quantity;
              
              const trade = {
                type: 'BUY',
                price: gridPrice,
                quantity: sellPosition.quantity,
                timestamp: new Date(dataPoint.timestamp),
                pnl: pnl,
                gridLevel: i + 1
              };
              
              trades.push(trade);
              positions.delete(`sell_${i+1}`);
              
              totalPnL += pnl;
              if (pnl > 0) winningTrades++;
              else losingTrades++;
            }
          }
        }
      }
      
      // Calculate drawdown
      const currentValue = totalInvestment + totalPnL;
      if (currentValue > peakValue) {
        peakValue = currentValue;
      }
      
      currentDrawdown = (peakValue - currentValue) / peakValue * 100;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }
    }
    
    const totalTrades = trades.length;
    const roi = (totalPnL / totalInvestment) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // Calculate Sharpe ratio
    const returns = trades.map(t => t.pnl / totalInvestment);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length : 0;
    const sharpeRatio = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;
    
    const results = {
      results: {
        totalTrades,
        winningTrades,
        losingTrades,
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
        winRate: parseFloat(winRate.toFixed(2))
      },
      trades: trades.slice(-50) // Return last 50 trades
    };
    
    // Save backtest results
    const backtestResult = new BacktestResult({
      strategyId,
      symbol,
      config,
      results: results.results,
      trades: results.trades,
      period
    });
    
    await backtestResult.save();
    
    console.log(`✅ Backtest completed: ${totalTrades} trades, ₹${totalPnL.toFixed(2)} P&L, ${roi.toFixed(2)}% ROI`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Backtest error:', error);
    throw error;
  }
}

// WebSocket event emitter
function emitStrategyUpdate(strategyId, data) {
  io.to(`strategy-${strategyId}`).emit('strategy-update', data);
}

// API Routes

// Create Grid Strategy
app.post('/api/strategy/create', async (req, res) => {
  try {
    const { symbol, config } = req.body;
    
    if (!symbol || !config) {
      return res.status(400).json({ error: 'Symbol and config are required' });
    }

    const strategyId = generateStrategyId();
    const gridLevels = calculateGridLevels(config);
    
    const strategy = new Strategy({
      strategyId,
      symbol,
      config,
      gridLevels,
      monitoring: {
        totalInvestment: config.investment,
        currentValue: config.investment
      }
    });

    await strategy.save();
    
    console.log(`✅ Strategy created: ${strategyId} with ${gridLevels.length} grid levels`);
    
    res.json({ success: true, strategyId, strategy, gridLevels });
  } catch (error) {
    console.error('Create strategy error:', error);
    res.status(500).json({ error: 'Failed to create strategy' });
  }
});

// Start Live Trading
// Enhanced Start Live Trading
// Replace the existing start-live endpoint
app.post('/api/strategy/start-live', async (req, res) => {
  try {
    const { strategy, userEmail, emailNotifications } = req.body;
    
    if (!strategy || !userEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy and user email are required' 
      });
    }

    // Stop all existing active strategies first
    const existingActiveStrategies = await Strategy.find({ status: 'ACTIVE' });
    
    for (const existingStrategy of existingActiveStrategies) {
      if (existingStrategy.strategyId !== strategy.id) {
        existingStrategy.status = 'STOPPED';
        await existingStrategy.save();
        
        // Cancel pending orders
        await Order.updateMany(
          { strategyId: existingStrategy.strategyId, status: 'PENDING' },
          { status: 'CANCELLED' }
        );
        
        // Remove from active strategies map
        activeStrategies.delete(existingStrategy.strategyId);
        
        console.log(`🛑 Stopped existing strategy: ${existingStrategy.strategyId} to start new one`);
      }
    }

    let targetStrategy = await Strategy.findOne({ strategyId: strategy.id });
    
    if (!targetStrategy) {
      const gridLevels = calculateGridLevels(strategy.config);
      
      targetStrategy = new Strategy({
        strategyId: strategy.id,
        symbol: strategy.stockSymbol,
        config: strategy.config,
        gridLevels,
        status: 'ACTIVE',
        monitoring: {
          totalInvestment: strategy.config.investment,
          currentValue: strategy.config.investment,
          userEmail: userEmail,
          emailNotifications: emailNotifications || true
        }
      });
      
      await targetStrategy.save();
      await createGridOrders(targetStrategy);
    } else {
      // Resume existing strategy
      targetStrategy.status = 'ACTIVE';
      targetStrategy.monitoring.userEmail = userEmail;
      targetStrategy.monitoring.emailNotifications = emailNotifications || true;
      await targetStrategy.save();
      
      // Check if we need to create new orders
      const existingOrders = await Order.find({ 
        strategyId: strategy.id, 
        status: 'PENDING' 
      });
      
      if (existingOrders.length === 0) {
        await createGridOrders(targetStrategy);
      }
    }

    // Store strategy in active strategies map
    activeStrategies.set(strategy.id, targetStrategy);
    
    console.log(`🚀 Live trading started for ${userEmail} - Strategy: ${strategy.id} (Single strategy enforced)`);
    
    res.json({ 
      success: true, 
      message: 'Live trading started successfully. Previous strategies have been stopped.',
      strategyId: strategy.id,
      strategy: targetStrategy
    });
    
  } catch (error) {
    console.error('Start live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start live trading: ' + error.message 
    });
  }
});



// Stop Live Trading
app.post('/api/strategy/stop-live', async (req, res) => {
  try {
    const { strategyId } = req.body;
    
    if (!strategyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy ID is required' 
      });
    }

    const strategy = await Strategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({ 
        success: false, 
        message: 'Strategy not found' 
      });
    }

    strategy.status = 'STOPPED';
    await strategy.save();

    await Order.updateMany(
      { strategyId, status: 'PENDING' },
      { status: 'CANCELLED' }
    );

    // Remove from active strategies
    activeStrategies.delete(strategyId);

    console.log(`🛑 Live trading stopped for strategy: ${strategyId}`);

    res.json({ 
      success: true, 
      message: 'Live trading stopped successfully' 
    });
    
  } catch (error) {
    console.error('Stop live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop live trading: ' + error.message 
    });
  }
});

// Run Backtest
app.post('/api/strategy/backtest', async (req, res) => {
  try {
    const { symbol, config, historicalData, period, gridLevels, mode, entryCondition, targetMethod } = req.body;
    
    if (!symbol || !config || !historicalData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Symbol, config, and historical data are required' 
      });
    }

    const strategyId = generateStrategyId();
    
    // Update config with additional parameters
    const enhancedConfig = {
      ...config,
      mode,
      entryCondition,
      targetMethod
    };
    
    console.log(`🔄 Starting backtest for ${symbol} with ${historicalData.length} data points`);
    
    const results = await performBacktest(strategyId, symbol, enhancedConfig, historicalData, period);
    
    res.json({
      success: true,
      results: results,
      message: 'Backtest completed successfully'
    });
    
  } catch (error) {
    console.error('Backtest error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Backtest failed: ' + error.message 
    });
  }
});

// Get all symbols
app.get('/api/symbols', (req, res) => {
  const symbols = Object.keys(NIFTY50_STOCKS).map(symbol => ({
    symbol: symbol,
    token: NIFTY50_STOCKS[symbol],
    liveData: liveData.get(symbol) || null
  }));
  
  res.json({
    success: true,
    count: symbols.length,
    data: symbols
  });
});

// Get live data
app.get('/api/live/:symbol?', (req, res) => {
  const { symbol } = req.params;
  
  if (symbol) {
    const symbolUpper = symbol.toUpperCase();
    const data = liveData.get(symbolUpper);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: `Live data not found for symbol: ${symbolUpper}`
      });
    }
    
    return res.json({
      success: true,
      data: data
    });
  }
  
  const allData = {};
  liveData.forEach((value, key) => {
    allData[key] = value;
  });
  
  res.json({
    success: true,
    count: Object.keys(allData).length,
    data: allData
  });
});

// Get historical data
app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { fromDate, toDate, interval = 'ONE_DAY' } = req.query;
    
    const symbolUpper = symbol.toUpperCase();
    
    if (!NIFTY50_STOCKS[symbolUpper]) {
      return res.status(404).json({
        success: false,
        message: `Symbol not found: ${symbolUpper}`
      });
    }
    
    const startDate = fromDate ? new Date(fromDate) : (() => {
      const date = new Date();
      date.setMonth(date.getMonth() - 6);
      return date;
    })();
    
    const endDate = toDate ? new Date(toDate) : new Date();
    
    const data = await getHistoricalData(symbolUpper, interval, startDate, endDate);
    
    res.json({
      success: true,
      symbol: symbolUpper,
      count: data.length,
      data: data
    });
    
  } catch (error) {
    console.error('Historical data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch historical data: ' + error.message
    });
  }
});

// Get strategy details
app.get('/api/strategy/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    const strategy = await Strategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: 'Strategy not found'
      });
    }
    
    const orders = await Order.find({ strategyId });
    
    res.json({
      success: true,
      strategy,
      orders
    });
    
  } catch (error) {
    console.error('Get strategy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get strategy details'
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('subscribe-strategy', (strategyId) => {
    socket.join(`strategy-${strategyId}`);
    console.log(`📡 Client subscribed to strategy: ${strategyId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  if (ws) {
    ws.close();
  }
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});

app.get('/api/strategy/:strategyId/orders', async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    const orders = await Order.find({ strategyId }).sort({ timestamp: -1 });
    const filledOrders = orders.filter(order => order.status === 'FILLED');
    const pendingOrders = orders.filter(order => order.status === 'PENDING');
    
    res.json({
      success: true,
      orders: {
        filled: filledOrders,
        pending: pendingOrders,
        total: orders.length
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Get all active strategies with their orders
app.get('/api/strategies/active', async (req, res) => {
  try {
    const activeStrategies = await Strategy.find({ status: 'ACTIVE' });
    const strategiesWithOrders = [];
    
    for (const strategy of activeStrategies) {
      const orders = await Order.find({ strategyId: strategy.strategyId });
      strategiesWithOrders.push({
        ...strategy.toObject(),
        orders: {
          filled: orders.filter(o => o.status === 'FILLED'),
          pending: orders.filter(o => o.status === 'PENDING')
        }
      });
    }
    
    res.json({
      success: true,
      strategies: strategiesWithOrders
    });
  } catch (error) {
    console.error('Error fetching active strategies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active strategies'
    });
  }
});