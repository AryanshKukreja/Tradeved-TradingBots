import express from 'express';
import { DCAOrder, DCAStrategy, DCABacktestResult } from '../Models/dcaModels.js';
import { DCATradingService } from '../Services/dcaService.js';
import { liveData, activeDCAStrategies, dcaCronJobs, smartAPI } from '../server.js';

const router = express.Router();

// Create DCA Strategy
router.post('/dca-strategy/create', async (req, res) => {
  try {
    const { symbol, config } = req.body;
    
    if (!symbol || !config) {
      return res.status(400).json({ error: 'Symbol and config are required' });
    }

    const strategyId = DCATradingService.generateDCAStrategyId();
    
    const strategy = new DCAStrategy({
      strategyId,
      symbol,
      config,
      monitoring: {
        totalInvestment: 0,
        currentValue: 0
      }
    });

    await strategy.save();
    
    console.log(`✅ DCA Strategy created: ${strategyId}`);
    
    res.json({ success: true, strategyId, strategy });
  } catch (error) {
    console.error('Create DCA strategy error:', error);
    res.status(500).json({ error: 'Failed to create DCA strategy' });
  }
});

// Start DCA Live Trading
router.post('/dca-strategy/start-live', async (req, res) => {
  try {
    const { strategy, userEmail, emailNotifications } = req.body;
    
    if (!strategy || !userEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy and user email are required' 
      });
    }

    // Stop all existing active DCA strategies first
    const existingActiveDCAStrategies = await DCAStrategy.find({ status: 'ACTIVE' });
    
    for (const existingStrategy of existingActiveDCAStrategies) {
      if (existingStrategy.strategyId !== strategy.id) {
        existingStrategy.status = 'STOPPED';
        await existingStrategy.save();
        
        await DCAOrder.updateMany(
          { strategyId: existingStrategy.strategyId, status: 'PENDING' },
          { status: 'CANCELLED' }
        );
        
        activeDCAStrategies.delete(existingStrategy.strategyId);
        DCATradingService.stopDCACronJob(existingStrategy.strategyId, dcaCronJobs);
        
        console.log(`🛑 Stopped existing DCA strategy: ${existingStrategy.strategyId} to start new one`);
      }
    }

    let targetStrategy = await DCAStrategy.findOne({ strategyId: strategy.id });
    
    if (!targetStrategy) {
      targetStrategy = new DCAStrategy({
        strategyId: strategy.id,
        symbol: strategy.stockSymbol,
        config: strategy.config,
        status: 'ACTIVE',
        monitoring: {
          totalInvestment: 0,
          currentValue: 0,
          userEmail: userEmail,
          emailNotifications: emailNotifications || true,
          nextOrderTime: new Date()
        }
      });
      
      await targetStrategy.save();
    } else {
      targetStrategy.status = 'ACTIVE';
      targetStrategy.monitoring.userEmail = userEmail;
      targetStrategy.monitoring.emailNotifications = emailNotifications || true;
      targetStrategy.monitoring.nextOrderTime = new Date();
      await targetStrategy.save();
    }

    activeDCAStrategies.set(strategy.id, targetStrategy);
    
    // Setup cron job for DCA execution
   DCATradingService.setupDCACronJob(targetStrategy, dcaCronJobs, liveData);
    
    console.log(`🚀 DCA Live trading started for ${userEmail} - Strategy: ${strategy.id}`);
    
    res.json({ 
      success: true, 
      message: 'DCA Live trading started successfully. Previous strategies have been stopped.',
      strategyId: strategy.id,
      strategy: targetStrategy
    });
    
  } catch (error) {
    console.error('Start DCA live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start DCA live trading: ' + error.message 
    });
  }
});

// Stop DCA Live Trading
router.post('/dca-strategy/stop-live', async (req, res) => {
  try {
    const { strategyId } = req.body;
    
    if (!strategyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Strategy ID is required' 
      });
    }

    const strategy = await DCAStrategy.findOne({ strategyId });
    if (!strategy) {
      return res.status(404).json({
        success: false,
        message: 'Strategy not found'
      });
    }

    strategy.status = 'STOPPED';
    await strategy.save();

    await DCAOrder.updateMany(
      { strategyId, status: 'PENDING' },
      { status: 'CANCELLED' }
    );

    activeDCAStrategies.delete(strategyId);
    DCATradingService.stopDCACronJob(strategyId, dcaCronJobs);

    console.log(`🛑 DCA Live trading stopped for strategy: ${strategyId}`);

    res.json({ 
      success: true, 
      message: 'DCA Live trading stopped successfully' 
    });
    
  } catch (error) {
    console.error('Stop DCA live trading error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop DCA live trading: ' + error.message 
    });
  }
});

// DCA Backtest
router.post('/dca-strategy/backtest', async (req, res) => {
  try {
    const { symbol, config, historicalData, period } = req.body;
    
    if (!symbol || !config || !historicalData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Symbol, config, and historical data are required' 
      });
    }

    const strategyId = DCATradingService.generateDCAStrategyId();
    
    console.log(`🔄 Starting DCA backtest for ${symbol} with ${historicalData.length} data points`);
    
    const results = await DCATradingService.performDCABacktest(strategyId, symbol, config, historicalData, period);
    
    res.json({
      success: true,
      results: results,
      message: 'DCA Backtest completed successfully'
    });
    
  } catch (error) {
    console.error('DCA Backtest error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'DCA Backtest failed: ' + error.message 
    });
  }
});

// Get DCA Strategy Orders
router.get('/dca-strategy/:strategyId/orders', async (req, res) => {
  try {
    const { strategyId } = req.params;
    
    const orders = await DCAOrder.find({ strategyId }).sort({ timestamp: -1 });
    const executedOrders = orders.filter(order => order.status === 'EXECUTED');
    const pendingOrders = orders.filter(order => order.status === 'PENDING');
    
    res.json({
      success: true,
      orders: {
        executed: executedOrders,
        pending: pendingOrders,
        total: orders.length
      }
    });
  } catch (error) {
    console.error('Error fetching DCA orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch DCA orders'
    });
  }
});

// Get Active DCA Strategies
router.get('/dca-strategies/active', async (req, res) => {
  try {
    const activeStrategies = await DCAStrategy.find({ status: 'ACTIVE' });
    const strategiesWithOrders = [];
    
    for (const strategy of activeStrategies) {
      const orders = await DCAOrder.find({ strategyId: strategy.strategyId });
      strategiesWithOrders.push({
        ...strategy.toObject(),
        orders: {
          executed: orders.filter(o => o.status === 'EXECUTED'),
          pending: orders.filter(o => o.status === 'PENDING')
        }
      });
    }
    
    res.json({
      success: true,
      strategies: strategiesWithOrders
    });
  } catch (error) {
    console.error('Error fetching active DCA strategies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active DCA strategies'
    });
  }
});

export default router;
