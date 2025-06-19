import { GridOrder, GridStrategy, GridBacktestResult } from '../Models/gridModels.js';
import cron from 'node-cron';

export class GridTradingService {
  constructor(liveData, activeStrategies, cronJobs, emailTransporter, io, smartAPI) {
    this.liveData = liveData;
    this.activeStrategies = activeStrategies;
    this.cronJobs = cronJobs;
    this.emailTransporter = emailTransporter;
    this.io = io;
    this.smartAPI = smartAPI;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  static generateStrategyId() {
    return `GRID_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static calculateGridLevels(config) {
    const levels = [];
    const { gridType, upperPrice, lowerPrice, levels: numLevels } = config;

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
  }

  static calculateQuantityPerLevel(config, currentPrice) {
    if (config.qtyPerOrder > 0) {
      return config.qtyPerOrder;
    }
    
    const investmentPerLevel = config.investment / config.levels;
    const avgPrice = currentPrice || (config.upperPrice + config.lowerPrice) / 2;
    return parseFloat((investmentPerLevel / avgPrice).toFixed(4));
  }

  // Enhanced order fill checking with better error handling
  async checkOrderFills(symbol, currentPrice) {
    try {
      console.log(`🔍 Checking orders for ${symbol} at price ₹${currentPrice}`);
      
      const activeStrategiesForSymbol = await GridStrategy.find({
        symbol: symbol,
        status: 'ACTIVE'
      });

      console.log(`📊 Found ${activeStrategiesForSymbol.length} active strategies for ${symbol}`);

      for (const strategy of activeStrategiesForSymbol) {
        // Update strategy's current price
        strategy.currentPrice = currentPrice;
        strategy.monitoring.lastPriceUpdate = new Date();
        await strategy.save();

        const pendingOrders = await GridOrder.find({
          strategyId: strategy.strategyId,
          status: 'PENDING'
        });

        console.log(`📋 Strategy ${strategy.strategyId} has ${pendingOrders.length} pending orders`);

        for (const order of pendingOrders) {
          // Update last checked price and time
          order.lastCheckedPrice = currentPrice;
          order.lastCheckedTime = new Date();
          
          const tolerance = order.price * 0.001; // 0.1% tolerance
          
          let shouldFill = false;
          
          if (order.type === 'BUY' && currentPrice <= (order.price + tolerance)) {
            shouldFill = true;
            console.log(`💰 BUY order should fill: ${currentPrice} <= ${order.price + tolerance}`);
          } else if (order.type === 'SELL' && currentPrice >= (order.price - tolerance)) {
            shouldFill = true;
            console.log(`💰 SELL order should fill: ${currentPrice} >= ${order.price - tolerance}`);
          }

          if (shouldFill) {
            console.log(`✅ Filling order: ${order.type} ${order.symbol} at ₹${currentPrice}`);
            await this.fillGridOrder(order, currentPrice, strategy);
          } else {
            // Save the updated order with new checked price/time
            await order.save();
          }
        }
      }
    } catch (error) {
      console.error('❌ Error checking Grid order fills:', error);
    }
  }

  // Enhanced order filling with better P&L calculation
  async fillGridOrder(order, fillPrice, strategy) {
    try {
      // Fill the order
      order.status = 'FILLED';
      order.fillPrice = fillPrice;
      order.fillTime = new Date();
      order.fillQuantity = order.quantity;
      
      // Calculate P&L
      if (order.type === 'BUY') {
        order.pnl = 0; // No P&L on buy orders initially
      } else {
        // For SELL orders, find the most recent BUY order to calculate P&L
        const buyOrders = await GridOrder.find({
          strategyId: order.strategyId,
          type: 'BUY',
          status: 'FILLED'
        }).sort({ fillTime: -1 });
        
        if (buyOrders.length > 0) {
          const buyOrder = buyOrders[0];
          order.pnl = (fillPrice - buyOrder.fillPrice) * order.quantity;
          console.log(`💰 P&L calculated: ₹${order.pnl.toFixed(2)} (Sell: ₹${fillPrice} - Buy: ₹${buyOrder.fillPrice})`);
        }
      }
      
      await order.save();
      
      console.log(`✅ Grid Order filled: ${order.type} ${order.symbol} at ₹${fillPrice}, P&L: ₹${order.pnl.toFixed(2)}`);
      
      // Create next grid order
      await this.createNextGridOrder(order, strategy);
      
      // Update monitoring data
      await this.updateGridMonitoringData(order.strategyId);
      
      // Send email notification
      await this.sendGridEmailNotification(order, strategy);
      
      // Emit real-time update
      this.emitStrategyUpdate(order.strategyId, {
        type: 'order_filled',
        order: order.toObject()
      });
      
    } catch (error) {
      console.error('❌ Error filling Grid order:', error);
    }
  }

  // Enhanced next order creation logic
  async createNextGridOrder(filledOrder, strategy) {
    try {
      const { gridLevels, config } = strategy;
      const currentPrice = filledOrder.fillPrice;
      const qtyPerLevel = GridTradingService.calculateQuantityPerLevel(config, currentPrice);
      
      // Determine next order type and price based on grid strategy
      let nextOrderType, nextPrice;
      
      if (filledOrder.type === 'BUY') {
        // After a BUY, create a SELL order above current price
        nextOrderType = 'SELL';
        const priceIncrement = (config.upperPrice - config.lowerPrice) / (config.levels + 1);
        nextPrice = filledOrder.fillPrice + priceIncrement;
      } else {
        // After a SELL, create a BUY order below current price
        nextOrderType = 'BUY';
        const priceDecrement = (config.upperPrice - config.lowerPrice) / (config.levels + 1);
        nextPrice = filledOrder.fillPrice - priceDecrement;
      }
      
      // Ensure price is within grid bounds
      if (nextPrice > config.upperPrice || nextPrice < config.lowerPrice) {
        console.log(`⚠️ Next order price ₹${nextPrice.toFixed(2)} is outside grid bounds, skipping`);
        return;
      }
      
      const orderId = `${filledOrder.strategyId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const nextOrder = new GridOrder({
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
      
      // Emit update for new order
      this.emitStrategyUpdate(filledOrder.strategyId, {
        type: 'order_created',
        order: nextOrder.toObject()
      });
      
    } catch (error) {
      console.error('❌ Error creating next grid order:', error);
    }
  }

  // Static method for creating initial grid orders
  static async createGridOrders(strategy) {
    const { strategyId, symbol, config, gridLevels, currentPrice } = strategy;
    const qtyPerLevel = GridTradingService.calculateQuantityPerLevel(config, currentPrice);
    
    // Clear existing orders
    await GridOrder.deleteMany({ strategyId });
    
    const orders = [];
    const referencePrice = currentPrice || (config.upperPrice + config.lowerPrice) / 2;
    
    console.log(`📊 Creating grid orders around reference price: ₹${referencePrice}`);
    
    for (let i = 0; i < gridLevels.length; i++) {
      const price = gridLevels[i];
      const orderId = `${strategyId}_${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine order type based on price relative to current price
      let orderType;
      if (price < referencePrice) {
        orderType = 'BUY'; // Place BUY orders below current price
      } else if (price > referencePrice) {
        orderType = 'SELL'; // Place SELL orders above current price
      } else {
        // Skip orders at current price
        continue;
      }
      
      const order = new GridOrder({
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
      await GridOrder.insertMany(orders);
      console.log(`✅ Created ${orders.length} grid orders for strategy ${strategyId}`);
      
      const buyOrders = orders.filter(o => o.type === 'BUY').length;
      const sellOrders = orders.filter(o => o.type === 'SELL').length;
      console.log(`📊 Orders breakdown: ${buyOrders} BUY, ${sellOrders} SELL`);
    }
  }

  // Enhanced monitoring data update
  async updateGridMonitoringData(strategyId) {
    try {
      const orders = await GridOrder.find({ strategyId });
      const strategy = await GridStrategy.findOne({ strategyId });
      
      if (!strategy) return;
      
      const filledOrders = orders.filter(o => o.status === 'FILLED').length;
      const pendingOrders = orders.filter(o => o.status === 'PENDING').length;
      const totalPnL = orders.reduce((sum, order) => sum + (order.pnl || 0), 0);
      const currentValue = strategy.monitoring.totalInvestment + totalPnL;
      const roi = strategy.monitoring.totalInvestment > 0 ? 
        (totalPnL / strategy.monitoring.totalInvestment) * 100 : 0;
      
      strategy.monitoring = {
        ...strategy.monitoring.toObject(),
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        filledOrders,
        pendingOrders,
        currentValue: parseFloat(currentValue.toFixed(2)),
        lastUpdate: new Date()
      };
      
      await strategy.save();
      
      console.log(`📊 Updated monitoring - P&L: ₹${totalPnL.toFixed(2)}, ROI: ${roi.toFixed(2)}%`);
      
      this.emitStrategyUpdate(strategyId, {
        type: 'monitoring_update',
        monitoring: strategy.monitoring
      });
      
    } catch (error) {
      console.error('❌ Error updating Grid monitoring data:', error);
    }
  }

  // Enhanced email notification system
  async sendGridEmailNotification(order, strategy) {
    try {
      if (!strategy.monitoring?.emailNotifications) return;
      
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
                  <td style="padding: 8px; font-weight: bold;">Execution Price:</td>
                  <td style="padding: 8px;"><strong>₹${order.fillPrice}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Quantity:</td>
                  <td style="padding: 8px;"><strong>${order.quantity}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">P&L:</td>
                  <td style="padding: 8px; color: ${order.pnl >= 0 ? '#00D4AA' : '#FF6B6B'};">
                    <strong>${order.pnl >= 0 ? '+' : ''}₹${order.pnl.toFixed(2)}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Total Strategy P&L:</td>
                  <td style="padding: 8px; color: ${strategy.monitoring.totalPnL >= 0 ? '#00D4AA' : '#FF6B6B'};">
                    <strong>${strategy.monitoring.totalPnL >= 0 ? '+' : ''}₹${strategy.monitoring.totalPnL.toFixed(2)}</strong>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #666; font-size: 12px;">
              Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </p>
          </div>
        `
      };
      
      await this.emailTransporter.sendMail(mailOptions);
      console.log(`📧 Grid Email notification sent to ${userEmail}`);
    } catch (error) {
      console.error('❌ Error sending Grid email:', error);
    }
  }

  // Enhanced backtesting functionality
  static async performBacktest(strategyId, symbol, config, historicalData, period) {
    try {
      const gridLevels = GridTradingService.calculateGridLevels(config);
      const trades = [];
      let totalPnL = 0;
      let totalInvestment = config.investment;
      let openPositions = [];
      
      console.log(`🔄 Starting Grid backtest for ${symbol} with ${gridLevels.length} grid levels`);
      
      for (let dataIndex = 0; dataIndex < historicalData.length; dataIndex++) {
        const dataPoint = historicalData[dataIndex];
        const currentPrice = dataPoint.close;
        
        for (let i = 0; i < gridLevels.length; i++) {
          const gridPrice = gridLevels[i];
          const tolerance = gridPrice * 0.002;
          
          if (Math.abs(currentPrice - gridPrice) <= tolerance) {
            const qtyPerLevel = GridTradingService.calculateQuantityPerLevel(config, currentPrice);
            
            const trade = {
              type: i % 2 === 0 ? 'BUY' : 'SELL',
              price: gridPrice,
              quantity: qtyPerLevel,
              timestamp: new Date(dataPoint.timestamp),
              pnl: 0
            };
            
            if (trade.type === 'BUY') {
              openPositions.push(trade);
            } else if (trade.type === 'SELL' && openPositions.length > 0) {
              const buyTrade = openPositions.shift();
              trade.pnl = (gridPrice - buyTrade.price) * qtyPerLevel;
              totalPnL += trade.pnl;
            }
            
            trades.push(trade);
          }
        }
      }
      
      const totalTrades = trades.length;
      const winningTrades = trades.filter(t => t.pnl > 0).length;
      const losingTrades = trades.filter(t => t.pnl < 0).length;
      const roi = (totalPnL / totalInvestment) * 100;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      
      const results = {
        results: {
          totalTrades,
          winningTrades,
          losingTrades,
          totalPnL: parseFloat(totalPnL.toFixed(2)),
          roi: parseFloat(roi.toFixed(2)),
          winRate: parseFloat(winRate.toFixed(2))
        },
        trades: trades.slice(-50)
      };
      
      const backtestResult = new GridBacktestResult({
        strategyId,
        symbol,
        config,
        results: results.results,
        trades: results.trades,
        period
      });
      
      await backtestResult.save();
      
      console.log(`✅ Grid Backtest completed: ${totalTrades} trades, ₹${totalPnL.toFixed(2)} P&L, ${roi.toFixed(2)}% ROI`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Grid Backtest error:', error);
      throw error;
    }
  }

  // Static method for setting up cron jobs
  static setupGridCronJob(strategy, cronJobs, liveData) {
    try {
      const { strategyId, symbol } = strategy;
      
      // Stop existing cron job if it exists
      if (cronJobs.has(strategyId)) {
        cronJobs.get(strategyId).stop();
        cronJobs.delete(strategyId);
      }
      
      // Create new cron job that runs every minute during market hours
      const cronJob = cron.schedule('* 9-15 * * 1-5', async () => {
        try {
          const currentData = liveData.get(symbol);
          if (currentData && currentData.ltp) {
            const gridService = new GridTradingService();
            await gridService.checkOrderFills(symbol, currentData.ltp);
          }
        } catch (error) {
          console.error(`❌ Error in Grid cron job for ${strategyId}:`, error);
        }
      }, {
        scheduled: false,
        timezone: "Asia/Kolkata"
      });
      
      cronJob.start();
      cronJobs.set(strategyId, cronJob);
      
      console.log(`⏰ Grid cron job set up for strategy ${strategyId}`);
    } catch (error) {
      console.error('❌ Error setting up Grid cron job:', error);
    }
  }

  // Real-time strategy update emission
  emitStrategyUpdate(strategyId, data) {
    try {
      this.io.to(`grid-strategy-${strategyId}`).emit('strategy-update', data);
    } catch (error) {
      console.error('❌ Error emitting strategy update:', error);
    }
  }
}
