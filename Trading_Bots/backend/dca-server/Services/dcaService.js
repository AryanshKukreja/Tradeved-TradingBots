import { DCAOrder, DCAStrategy, DCABacktestResult } from '../Models/dcaModels.js';
import cron from 'node-cron';

export class DCATradingService {
  static instance = null;
  
  constructor(liveData, activeStrategies, cronJobs, emailTransporter, io, smartAPI) {
    // Implement singleton pattern to prevent multiple instances with null parameters
    if (DCATradingService.instance) {
      return DCATradingService.instance;
    }
    
    this.liveData = liveData;
    this.activeStrategies = activeStrategies;
    this.cronJobs = cronJobs;
    this.emailTransporter = emailTransporter;
    this.io = io;
    this.smartAPI = smartAPI;
    
    DCATradingService.instance = this;
  }

  static generateDCAStrategyId() {
    return `DCA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static calculateNextOrderTime(lastOrderTime, frequency, frequencyUnit) {
    const nextTime = new Date(lastOrderTime);
    if (frequencyUnit === 'minutes') {
      nextTime.setMinutes(nextTime.getMinutes() + frequency);
    } else if (frequencyUnit === 'hours') {
      nextTime.setHours(nextTime.getHours() + frequency);
    } else {
      nextTime.setDate(nextTime.getDate() + frequency);
    }
    return nextTime;
  }

  static shouldExecuteDCAOrder(strategy, currentTime) {
    const { config, monitoring } = strategy;
    
    // Check if it's time for the next order
    if (monitoring.nextOrderTime && currentTime < monitoring.nextOrderTime) {
      return false;
    }
    
    // Check end conditions
    if (config.endCondition === 'orderCount' && monitoring.executedOrders >= config.maxOrders) {
      return false;
    }
    
    // Check stop loss
    if (config.enableStopLoss && monitoring.roi <= -config.stopLoss) {
      return false;
    }
    
    // Check take profit
    if (config.enableTakeProfit && monitoring.roi >= config.takeProfit) {
      return false;
    }
    
    return true;
  }

  // FIXED: Convert to static method
  static async processPriceUpdate(stockData, liveData, activeStrategies) {
    try {
      // Update live data
      liveData.set(stockData.symbol, stockData);
      
      // Check if any active DCA strategies need to execute orders
      for (const [strategyId, strategy] of activeStrategies) {
        if (strategy.symbol === stockData.symbol && strategy.status === 'ACTIVE') {
          if (DCATradingService.shouldExecuteDCAOrder(strategy, new Date())) {
            await DCATradingService.executeDCAOrder(strategy, stockData.ltp, liveData);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing price update:', error);
    }
  }

  // FIXED: Convert to static method
  static async executeDCAOrder(strategy, currentPrice, liveData, emailTransporter = null, io = null) {
    try {
      const { config } = strategy;
      const quantity = config.investmentAmount / currentPrice;
      const orderId = `${strategy.strategyId}_${strategy.monitoring.executedOrders + 1}_${Date.now()}`;
      
      const dcaOrder = new DCAOrder({
        strategyId: strategy.strategyId,
        symbol: strategy.symbol,
        orderId,
        type: config.orderType,
        price: currentPrice,
        quantity: quantity,
        amount: config.investmentAmount,
        status: 'EXECUTED',
        scheduledTime: new Date(),
        fillPrice: currentPrice,
        fillTime: new Date(),
        orderNumber: strategy.monitoring.executedOrders + 1
      });
      
      await dcaOrder.save();
      
      // Update strategy monitoring
      await DCATradingService.updateDCAMonitoring(strategy.strategyId, dcaOrder, liveData, io);
      
      console.log(`✅ DCA Order executed: ${config.orderType} ${strategy.symbol} at ₹${currentPrice}`);
      
      // Send email notification
      if (emailTransporter) {
        await DCATradingService.sendDCAEmailNotification(dcaOrder, strategy, emailTransporter);
      }
      
      return dcaOrder;
      
    } catch (error) {
      console.error('❌ Error executing DCA order:', error);
      throw error;
    }
  }

  // FIXED: Convert to static method
  static async updateDCAMonitoring(strategyId, newOrder, liveData, io = null) {
    try {
      const strategy = await DCAStrategy.findOne({ strategyId });
      if (!strategy) return;
      
      const allOrders = await DCAOrder.find({ strategyId, status: 'EXECUTED' });
      
      const totalInvestment = allOrders.reduce((sum, order) => sum + order.amount, 0);
      const totalQuantity = allOrders.reduce((sum, order) => sum + order.quantity, 0);
      const averagePrice = totalQuantity > 0 ? totalInvestment / totalQuantity : 0;
      
      // Get current price for P&L calculation
      const currentPrice = liveData.get(strategy.symbol)?.ltp || newOrder.fillPrice;
      const currentValue = totalQuantity * currentPrice;
      const totalPnL = currentValue - totalInvestment;
      const roi = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
      
      // Calculate next order time
      const nextOrderTime = DCATradingService.calculateNextOrderTime(
        newOrder.fillTime, 
        strategy.config.frequency, 
        strategy.config.frequencyUnit
      );
      
      strategy.monitoring = {
        ...strategy.monitoring,
        totalPnL,
        roi,
        executedOrders: allOrders.length,
        totalInvestment,
        currentValue,
        averagePrice,
        totalQuantity,
        nextOrderTime,
        lastUpdate: new Date()
      };
      
      await strategy.save();
      
      // FIXED: Add null check for Socket.IO emit
      if (io) {
        io.emit('dca-strategy-update', {
          type: 'monitoring_update',
          strategyId,
          monitoring: strategy.monitoring
        });
      } else {
        console.warn('⚠️ Socket.IO not available, skipping real-time update');
      }
      
    } catch (error) {
      console.error('❌ Error updating DCA monitoring:', error);
    }
  }

  // FIXED: Convert to static method
  static async sendDCAEmailNotification(order, strategy, emailTransporter) {
    try {
      // FIXED: Add null check for email transporter
      if (!emailTransporter) {
        console.warn('⚠️ Email transporter not available, skipping notification');
        return;
      }
      
      const userEmail = strategy.monitoring?.userEmail || 'kukrejaaryansh297@gmail.com';
      
      const mailOptions = {
        from: 'kukrejaaryansh297@gmail.com',
        to: userEmail,
        subject: `🚀 DCA Trading Alert - ${order.type} Order Executed`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #00D4AA;">🚀 DCA Order Executed</h2>
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
                  <td style="padding: 8px; font-weight: bold;">Order Number:</td>
                  <td style="padding: 8px;">#${order.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Order Type:</td>
                  <td style="padding: 8px; color: ${order.type === 'BUY' ? '#00D4AA' : '#FF6B6B'};">
                    <strong>${order.type}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Execution Price:</td>
                  <td style="padding: 8px;"><strong>₹${order.fillPrice}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Investment Amount:</td>
                  <td style="padding: 8px;">₹${order.amount}</td>
                </tr>
              </table>
            </div>
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0; color: #2d5a2d;">DCA Strategy Performance</h3>
              <p><strong>Total Investment:</strong> ₹${strategy.monitoring.totalInvestment.toFixed(2)}</p>
              <p><strong>Current Value:</strong> ₹${strategy.monitoring.currentValue.toFixed(2)}</p>
              <p><strong>Total P&L:</strong> ₹${strategy.monitoring.totalPnL.toFixed(2)}</p>
              <p><strong>ROI:</strong> ${strategy.monitoring.roi.toFixed(2)}%</p>
              <p><strong>Average Price:</strong> ₹${strategy.monitoring.averagePrice.toFixed(2)}</p>
            </div>
          </div>
        `
      };
      
      await emailTransporter.sendMail(mailOptions);
      console.log(`📧 DCA Email notification sent to ${userEmail}`);
    } catch (error) {
      console.error('❌ Error sending DCA email:', error);
    }
  }

  // FIXED: Convert to static method - THIS IS THE KEY FIX FOR YOUR ERROR
  static setupDCACronJob(strategy, dcaCronJobs, liveData, emailTransporter = null, io = null) {
    const { strategyId, config } = strategy;
    
    // Create cron expression based on frequency
    let cronExpression;
    if (config.frequencyUnit === 'minutes') {
      cronExpression = `*/${config.frequency} * * * *`;
    } else if (config.frequencyUnit === 'hours') {
      cronExpression = `0 */${config.frequency} * * *`;
    } else {
      cronExpression = `0 9 */${config.frequency} * *`;
    }
    
    const cronJob = cron.schedule(cronExpression, async () => {
      try {
        const currentStrategy = await DCAStrategy.findOne({ strategyId });
        if (!currentStrategy || currentStrategy.status !== 'ACTIVE') {
          console.log(`⏸️ DCA strategy ${strategyId} is not active, skipping execution`);
          return;
        }
        
        const currentPrice = liveData.get(currentStrategy.symbol)?.ltp;
        if (!currentPrice) {
          console.log(`❌ No live price data for ${currentStrategy.symbol}`);
          return;
        }
        
        if (DCATradingService.shouldExecuteDCAOrder(currentStrategy, new Date())) {
          await DCATradingService.executeDCAOrder(currentStrategy, currentPrice, liveData, emailTransporter, io);
          console.log(`✅ DCA order executed for strategy ${strategyId}`);
        } else {
          console.log(`⏭️ DCA order skipped for strategy ${strategyId} - conditions not met`);
        }
        
      } catch (error) {
        console.error(`❌ Error in DCA cron job for strategy ${strategyId}:`, error);
      }
    }, {
      scheduled: false
    });
    
    dcaCronJobs.set(strategyId, cronJob);
    cronJob.start();
    
    console.log(`⏰ DCA cron job setup for strategy ${strategyId} with expression: ${cronExpression}`);
  }

  // FIXED: Convert to static method - THIS FIXES YOUR MAIN ERROR
  static stopDCACronJob(strategyId, dcaCronJobs) {
    try {
      console.log(`🔄 Attempting to stop cron job for strategy: ${strategyId}`);
      
      if (!dcaCronJobs || !dcaCronJobs.has(strategyId)) {
        console.log(`⚠️ No active cron job found for strategy: ${strategyId}`);
        return false;
      }

      const cronJob = dcaCronJobs.get(strategyId);
      
      if (cronJob && typeof cronJob.stop === 'function') {
        cronJob.stop();
        
        if (typeof cronJob.destroy === 'function') {
          cronJob.destroy();
        }
        
        dcaCronJobs.delete(strategyId);
        console.log(`✅ Successfully stopped cron job for strategy: ${strategyId}`);
        return true;
      } else {
        console.error(`❌ Invalid cron job object for strategy: ${strategyId}`);
        dcaCronJobs.delete(strategyId);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error stopping cron job for strategy ${strategyId}:`, error);
      return false;
    }
  }

  // Keep static methods for utility functions that don't need instance data
  static async performDCABacktest(strategyId, symbol, config, historicalData, period) {
    try {
      const trades = [];
      let totalInvestment = 0;
      let totalQuantity = 0;
      let totalOrders = 0;
      
      console.log(`🔄 Starting DCA backtest for ${symbol} with ${historicalData.length} data points`);
      
      // Simulate DCA orders based on frequency
      const frequencyInDays = config.frequencyUnit === 'days' ? config.frequency : config.frequency / 24;
      const orderInterval = Math.max(1, Math.floor(frequencyInDays));
      
      for (let i = 0; i < historicalData.length; i += orderInterval) {
        if (config.endCondition === 'orderCount' && totalOrders >= config.maxOrders) {
          break;
        }
        
        const dataPoint = historicalData[i];
        const price = dataPoint.close;
        const quantity = config.investmentAmount / price;
        
        const trade = {
          type: config.orderType,
          price: price,
          quantity: quantity,
          timestamp: new Date(dataPoint.timestamp),
          pnl: 0
        };
        
        trades.push(trade);
        totalInvestment += config.investmentAmount;
        totalQuantity += quantity;
        totalOrders++;
      }
      
      // Calculate final metrics
      const averagePrice = totalInvestment / totalQuantity;
      const finalPrice = historicalData[historicalData.length - 1].close;
      const currentValue = totalQuantity * finalPrice;
      const totalPnL = currentValue - totalInvestment;
      const roi = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
      
      const results = {
        results: {
          totalOrders,
          totalInvestment: parseFloat(totalInvestment.toFixed(2)),
          currentValue: parseFloat(currentValue.toFixed(2)),
          totalPnL: parseFloat(totalPnL.toFixed(2)),
          roi: parseFloat(roi.toFixed(2)),
          averagePrice: parseFloat(averagePrice.toFixed(2)),
          totalQuantity: parseFloat(totalQuantity.toFixed(4)),
          finalPrice: parseFloat(finalPrice.toFixed(2))
        },
        trades: trades.slice(-50)
      };
      
      // Save backtest results
      const backtestResult = new DCABacktestResult({
        strategyId,
        symbol,
        config,
        results: results.results,
        trades: results.trades,
        period
      });
      
      await backtestResult.save();
      
      console.log(`✅ DCA Backtest completed: ${totalOrders} orders, ₹${totalPnL.toFixed(2)} P&L, ${roi.toFixed(2)}% ROI`);
      
      return results;
      
    } catch (error) {
      console.error('❌ DCA Backtest error:', error);
      throw error;
    }
  }
}
