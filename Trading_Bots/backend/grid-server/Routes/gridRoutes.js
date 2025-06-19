import express from 'express';
import { GridOrder, GridStrategy, GridBacktestResult } from '../Models/gridModels.js';
import { GridTradingService } from '../Services/gridService.js';
import { liveData, activeGridStrategies, smartAPI } from '../server.js';
import axios from 'axios';

const router = express.Router();
const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || 'http://localhost:3000';

// Create Grid Strategy
router.post('/grid-strategy/create', async (req, res) => {
  try {
    const { symbol, config } = req.body;
    
    if (!symbol || !config) {
      return res.status(400).json({ error: 'Symbol and config are required' });
    }

    const strategyId = GridTradingService.generateStrategyId();
    const gridLevels = GridTradingService.calculateGridLevels(config);
    
    const strategy = new GridStrategy({
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
    
    console.log(`✅ Grid Strategy created: ${strategyId} with ${gridLevels.length} grid levels`);
    
    res.json({ success: true, strategyId, strategy, gridLevels });
  } catch (error) {
    console.error('Create Grid strategy error:', error);
    res.status(500).json({ error: 'Failed to create Grid strategy' });
  }
});

// Start Grid Live Trading
router.post('/grid-strategy/start-live', async (req, res) => {
  try {
    const { strategy, userEmail, emailNotifications } = req.body;
    
    if (!strategy || !userEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy and user email are required' 
      });
    }

    // Stop all existing active strategies first
    const existingActiveStrategies = await GridStrategy.find({ status: 'ACTIVE' });
    
    for (const existingStrategy of existingActiveStrategies) {
      if (existingStrategy.strategyId !== strategy.id) {
        existingStrategy.status = 'STOPPED';
        await existingStrategy.save();
        
        await GridOrder.updateMany(
          { strategyId: existingStrategy.strategyId, status: 'PENDING' },
          { status: 'CANCELLED' }
        );
        
        activeGridStrategies.delete(existingStrategy.strategyId);
        
        console.log(`🛑 Stopped existing Grid strategy: ${existingStrategy.strategyId} to start new one`);
      }
    }

    // Get current price before creating strategy
    let currentPrice = 0;
    try {
      const liveDataResponse = await axios.get(`${DATA_SERVICE_URL}/api/live/${strategy.stockSymbol}`);
      currentPrice = liveDataResponse.data?.ltp || (strategy.config.upperPrice + strategy.config.lowerPrice) / 2;
      console.log(`📊 Current price for ${strategy.stockSymbol}: ₹${currentPrice}`);
    } catch (error) {
      console.warn(`⚠️ Could not fetch current price for ${strategy.stockSymbol}, using average`);
      currentPrice = (strategy.config.upperPrice + strategy.config.lowerPrice) / 2;
    }

    let targetStrategy = await GridStrategy.findOne({ strategyId: strategy.id });
    
    if (!targetStrategy) {
      const gridLevels = GridTradingService.calculateGridLevels(strategy.config);
      
      targetStrategy = new GridStrategy({
        strategyId: strategy.id,
        symbol: strategy.stockSymbol,
        config: strategy.config,
        gridLevels,
        status: 'ACTIVE',
        currentPrice: currentPrice,
        monitoring: {
          totalInvestment: strategy.config.investment,
          currentValue: strategy.config.investment,
          userEmail: userEmail,
          emailNotifications: emailNotifications || true,
          startTime: new Date()
        }
      });
      
      await targetStrategy.save();
      await GridTradingService.createGridOrders(targetStrategy);
    } else {
      targetStrategy.status = 'ACTIVE';
      targetStrategy.currentPrice = currentPrice;
      targetStrategy.monitoring.userEmail = userEmail;
      targetStrategy.monitoring.emailNotifications = emailNotifications || true;
      targetStrategy.monitoring.startTime = new Date();
      await targetStrategy.save();
      
      const existingOrders = await GridOrder.find({ 
        strategyId: strategy.id, 
        status: 'PENDING' 
      });
      
      if (existingOrders.length === 0) {
        await GridTradingService.createGridOrders(targetStrategy);
      }
    }

    activeGridStrategies.set(strategy.id, targetStrategy);
    
    // Get order counts for response
    const orders = await GridOrder.find({ strategyId: strategy.id });
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
    
    console.log(`🚀 Grid Live trading started for ${userEmail} - Strategy: ${strategy.id} with ${pendingOrders} pending orders`);
    
    res.json({ 
      success: true, 
      message: `Grid Live trading started successfully with ${pendingOrders} pending orders. Previous strategies have been stopped.`,
      strategyId: strategy.id,
      strategy: targetStrategy,
      currentPrice: currentPrice,
      pendingOrders: pendingOrders
    });
    
  } catch (error) {
    console.error('Start Grid live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start Grid live trading: ' + error.message 
    });
  }
});

// Stop Grid Live Trading
router.post('/grid-strategy/stop-live', async (req, res) => {
  try {
    const { strategyId } = req.body;
    
    if (!strategyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy ID is required' 
      });
    }

    const strategy = await GridStrategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({ 
        success: false, 
        message: 'Strategy not found' 
      });
    }

    strategy.status = 'STOPPED';
    await strategy.save();

    const cancelledOrders = await GridOrder.updateMany(
      { strategyId, status: 'PENDING' },
      { status: 'CANCELLED' }
    );

    activeGridStrategies.delete(strategyId);

    console.log(`🛑 Grid Live trading stopped for strategy: ${strategyId}, cancelled ${cancelledOrders.modifiedCount} orders`);

    res.json({ 
      success: true, 
      message: `Grid Live trading stopped successfully. Cancelled ${cancelledOrders.modifiedCount} pending orders.`,
      cancelledOrders: cancelledOrders.modifiedCount
    });
    
  } catch (error) {
    console.error('Stop Grid live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop Grid live trading: ' + error.message 
    });
  }
});

// Grid Backtest
router.post('/grid-strategy/backtest', async (req, res) => {
  try {
    const { symbol, config, historicalData, period } = req.body;
    
    if (!symbol || !config || !historicalData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Symbol, config, and historical data are required' 
      });
    }

    const strategyId = GridTradingService.generateStrategyId();
    
    console.log(`🔄 Starting Grid backtest for ${symbol} with ${historicalData.length} data points`);
    
    const results = await GridTradingService.performBacktest(strategyId, symbol, config, historicalData, period);
    
    res.json({
      success: true,
      results: results,
      message: 'Grid Backtest completed successfully'
    });
    
  } catch (error) {
    console.error('Grid Backtest error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Grid Backtest failed: ' + error.message 
    });
  }
});

// Get Grid Strategy Orders
router.get('/grid-strategy/:strategyId/orders', async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    const orders = await GridOrder.find({ strategyId }).sort({ timestamp: -1 });
    const filledOrders = orders.filter(order => order.status === 'FILLED');
    const pendingOrders = orders.filter(order => order.status === 'PENDING');
    const cancelledOrders = orders.filter(order => order.status === 'CANCELLED');
    
    res.json({
      success: true,
      orders: {
        filled: filledOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
        total: orders.length
      },
      summary: {
        totalOrders: orders.length,
        filledCount: filledOrders.length,
        pendingCount: pendingOrders.length,
        cancelledCount: cancelledOrders.length,
        totalPnL: filledOrders.reduce((sum, order) => sum + (order.pnl || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error fetching Grid orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Grid orders'
    });
  }
});

// Get Active Grid Strategies
router.get('/grid-strategies/active', async (req, res) => {
  try {
    const activeStrategies = await GridStrategy.find({ status: 'ACTIVE' });
    const strategiesWithOrders = [];
    
    for (const strategy of activeStrategies) {
      const orders = await GridOrder.find({ strategyId: strategy.strategyId });
      const filledOrders = orders.filter(o => o.status === 'FILLED');
      const pendingOrders = orders.filter(o => o.status === 'PENDING');
      
      strategiesWithOrders.push({
        ...strategy.toObject(),
        orders: {
          filled: filledOrders,
          pending: pendingOrders,
          total: orders.length
        },
        performance: {
          totalPnL: filledOrders.reduce((sum, order) => sum + (order.pnl || 0), 0),
          totalTrades: filledOrders.length,
          pendingOrders: pendingOrders.length
        }
      });
    }
    
    res.json({
      success: true,
      strategies: strategiesWithOrders,
      count: strategiesWithOrders.length
    });
  } catch (error) {
    console.error('Error fetching active Grid strategies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active Grid strategies'
    });
  }
});

// Get Grid Strategy Details
router.get('/grid-strategy/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    const strategy = await GridStrategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: 'Strategy not found'
      });
    }
    
    const orders = await GridOrder.find({ strategyId }).sort({ timestamp: -1 });
    
    res.json({
      success: true,
      strategy: strategy.toObject(),
      orders: orders,
      summary: {
        totalOrders: orders.length,
        filledOrders: orders.filter(o => o.status === 'FILLED').length,
        pendingOrders: orders.filter(o => o.status === 'PENDING').length,
        totalPnL: orders.reduce((sum, order) => sum + (order.pnl || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error fetching Grid strategy details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Grid strategy details'
    });
  }
});

// Force check orders (for debugging)
router.post('/grid-strategy/:strategyId/check-orders', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const { currentPrice } = req.body;
    
    const strategy = await GridStrategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: 'Strategy not found'
      });
    }
    
    if (!currentPrice) {
      return res.status(400).json({
        success: false,
        message: 'Current price is required'
      });
    }
    
    // Get the grid service instance from the main server
    const gridService = new GridTradingService(liveData, activeGridStrategies, null, null, smartAPI);
    await gridService.checkOrderFills(strategy.symbol, currentPrice);
    
    res.json({
      success: true,
      message: 'Order check completed',
      currentPrice: currentPrice
    });
  } catch (error) {
    console.error('Error checking orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check orders'
    });
  }
});

export default router;
