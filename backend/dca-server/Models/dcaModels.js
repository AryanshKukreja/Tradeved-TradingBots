import mongoose from 'mongoose';

const DCAOrderSchema = new mongoose.Schema({
  strategyId: { type: String, required: true },
  symbol: { type: String, required: true },
  orderId: { type: String, unique: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'EXECUTED', 'CANCELLED'], default: 'PENDING' },
  scheduledTime: { type: Date, required: true },
  timestamp: { type: Date, default: Date.now },
  fillPrice: { type: Number, default: null },
  fillTime: { type: Date, default: null },
  orderNumber: { type: Number, required: true }
});

const DCAStrategySchema = new mongoose.Schema({
  strategyId: { type: String, unique: true, required: true },
  symbol: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'STOPPED', 'COMPLETED'], default: 'STOPPED' },
  config: {
    investmentAmount: { type: Number, required: true },
    frequency: { type: Number, required: true },
    frequencyUnit: { type: String, enum: ['minutes','hours', 'days'], required: true },
    startTime: { type: Date, required: true },
    endCondition: { type: String, enum: ['orderCount', 'stopLoss', 'takeProfit', 'manual'], required: true },
    maxOrders: { type: Number, default: 0 },
    stopLoss: { type: Number, default: 0 },
    takeProfit: { type: Number, default: 0 },
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

const DCABacktestResultSchema = new mongoose.Schema({
  strategyId: { type: String, required: true },
  symbol: { type: String, required: true },
  config: { type: Object, required: true },
  results: {
    totalOrders: { type: Number, default: 0 },
    totalInvestment: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },
    totalPnL: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    averagePrice: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    finalPrice: { type: Number, default: 0 }
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

export const DCAOrder = mongoose.model('DCAOrder', DCAOrderSchema);
export const DCAStrategy = mongoose.model('DCAStrategy', DCAStrategySchema);
export const DCABacktestResult = mongoose.model('DCABacktestResult', DCABacktestResultSchema);
