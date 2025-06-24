import mongoose from 'mongoose';

const GridOrderSchema = new mongoose.Schema({
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
  takeProfitPrice: { type: Number, default: null },
  lastCheckedPrice: { type: Number, default: null },
  lastCheckedTime: { type: Date, default: Date.now }
});

const GridStrategySchema = new mongoose.Schema({
  strategyId: { type: String, unique: true, required: true },
  symbol: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'STOPPED', 'COMPLETED'], default: 'STOPPED' },
  currentPrice: { type: Number, default: 0 },
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
    lastUpdate: { type: Date, default: Date.now },
    lastPriceUpdate: { type: Date, default: Date.now },
    userEmail: { type: String, default: '' },
    emailNotifications: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const GridBacktestResultSchema = new mongoose.Schema({
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

// Add indexes for better performance
GridOrderSchema.index({ strategyId: 1, status: 1 });
GridOrderSchema.index({ symbol: 1, status: 1 });
GridStrategySchema.index({ symbol: 1, status: 1 });

export const GridOrder = mongoose.model('GridOrder', GridOrderSchema);
export const GridStrategy = mongoose.model('GridStrategy', GridStrategySchema);
export const GridBacktestResult = mongoose.model('GridBacktestResult', GridBacktestResultSchema);
