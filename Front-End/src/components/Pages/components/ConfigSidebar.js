import React, { useState, useEffect } from 'react';

function ConfigSidebar({ 
  isRunning, 
  setIsRunning, 
  selectedStock, 
  onStrategyUpdate, 
  onOrdersUpdate 
}) {
  const [form, setForm] = useState(() => {
  // Try to get the saved form data from localStorage
  const savedForm = localStorage.getItem('gridStrategyForm');
  
  if (savedForm) {
    // If there is saved data, parse it and return it
    return JSON.parse(savedForm);
  } else {
    // Otherwise, return the default initial state
    return {
      gridType: "Arithmetic",
      investment: 10000.0,
      qtyPerOrder: 0.0,
      useTrigger: false,
      triggerPrice: 0.0,
      stopLoss: 0.0,
      takeProfit: 0.0,
      distributionType: "Arithmetic",
      mode: "Neutral",
      entryCondition: "Crossing",
      targetMethod: "Exchange"
    };
  }
});


  const [strategy, setStrategy] = useState(null);
  const [orders, setOrders] = useState([]);
  const [showBacktestModal, setShowBacktestModal] = useState(false);
  const [backtestPeriod, setBacktestPeriod] = useState('1M');
  const [backtestResults, setBacktestResults] = useState(null);
  const [backtesting, setBacktesting] = useState(false);
  const [liveTrading, setLiveTrading] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [monitoringData, setMonitoringData] = useState(null);

  // Update form when stock changes
  useEffect(() => {
    if (selectedStock && selectedStock.price > 0) {
      const currentPrice = selectedStock.price;
      setForm(prev => ({
        ...prev,
        triggerPrice: currentPrice
      }));
    }
  }, [selectedStock]);

  // Setup real-time monitoring when live trading starts
  useEffect(() => {
    let ws = null;
    
    if (liveTrading && strategy) {
      ws = new WebSocket('ws://localhost:3001');
      
      ws.onopen = () => {
        console.log('📡 WebSocket connected for monitoring');
        ws.send(JSON.stringify({
          action: 'subscribe',
          strategyId: strategy.strategyId
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'order_filled') {
            // Update orders state
            setOrders(prev => prev.map(order => 
              order.orderId === data.order.orderId ? data.order : order
            ));
            
            // Show notification
            console.log(`✅ Order filled: ${data.order.type} ${data.order.symbol} @ ₹${data.order.fillPrice}`);
          } else if (data.type === 'monitoring_update') {
            setMonitoringData(data.monitoring);
          } else if (data.type === 'new_order') {
            // Add new grid order
            setOrders(prev => [...prev, data.order]);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('WebSocket connection closed');
        if (liveTrading) {
          // Attempt to reconnect after 5 seconds
          setTimeout(() => {
            if (liveTrading) {
              // Reconnect logic would go here
            }
          }, 5000);
        }
      };
    }
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [liveTrading, strategy]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) =>
      type === "checkbox"
        ? { ...f, [name]: checked }
        : { ...f, [name]: type === "number" ? parseFloat(value) || 0 : value }
    );
  };

  // Fixed Grid Level Calculation - Exact number of levels
  const calculateGridLevels = () => {
    const { gridType, upperPrice, lowerPrice, levels: numLevels } = form;
    const levels = [];
    
    if (numLevels > 0 && upperPrice > lowerPrice) {
      if (gridType === "Arithmetic") {
        // Linear distribution between upper and lower price
        const step = (upperPrice - lowerPrice) / (numLevels + 1);
        for (let i = 1; i <= numLevels; i++) {
          levels.push(parseFloat((lowerPrice + i * step).toFixed(2)));
        }
      } else {
        // Geometric distribution
        const factor = Math.pow(upperPrice / lowerPrice, 1 / (numLevels + 1));
        for (let i = 1; i <= numLevels; i++) {
          levels.push(parseFloat((lowerPrice * Math.pow(factor, i)).toFixed(2)));
        }
      }
    }
    
    return levels.sort((a, b) => a - b);
  };

  const getBacktestDateRange = (period) => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1W':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '3M':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6M':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case '1Y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  const createStrategy = async (e) => {
    e.preventDefault();
    
    try {
      const gridLevels = calculateGridLevels();
      
      // Validate that we get the exact number of levels requested
      if (gridLevels.length !== form.levels) {
        alert(`Error: Expected ${form.levels} grid levels, but calculated ${gridLevels.length}. Please check your price range.`);
        return;
      }

      const stockSymbol = selectedStock.symbol.split('/')[0];

      const strategyConfig = {
        gridType: form.gridType,
        upperPrice: form.upperPrice,
        lowerPrice: form.lowerPrice,
        levels: form.levels,
        investment: form.investment,
        qtyPerOrder: form.qtyPerOrder,
        useTrigger: form.useTrigger,
        triggerPrice: form.triggerPrice,
        stopLoss: form.stopLoss,
        takeProfit: form.takeProfit,
        mode: form.mode,
        entryCondition: form.entryCondition,
        targetMethod: form.targetMethod,
        gridLevels: gridLevels
      };

      // Save strategy to backend
      const response = await fetch('http://localhost:3001/api/grid-strategy/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stockSymbol,
          config: strategyConfig
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const newStrategy = {
          id: result.strategyId,
          strategyId: result.strategyId,
          symbol: selectedStock.symbol,
          stockSymbol: stockSymbol,
          type: 'grid',
          config: strategyConfig,
          status: 'created',
          createdAt: new Date().toISOString(),
          monitoring: {
            totalPnL: 0,
            roi: 0,
            filledOrders: 0,
            pendingOrders: 0,
            totalInvestment: form.investment,
            currentValue: form.investment
          }
        };

        setStrategy(newStrategy);
        setOrders([]);
        
        onStrategyUpdate?.(newStrategy);
        onOrdersUpdate?.([]);
        
        console.log(`✅ Strategy created with ${gridLevels.length} grid levels`);
        alert(`✅ Grid Strategy Created Successfully!\n\n📊 Grid Levels: ${gridLevels.length}\n💰 Investment: ₹${form.investment.toLocaleString()}\n📈 Mode: ${form.mode}\n🎯 Range: ₹${form.lowerPrice} - ₹${form.upperPrice}`);
      } else {
        throw new Error(result.message || 'Failed to create strategy');
      }

    } catch (error) {
      console.error('Error creating strategy:', error);
      alert('Failed to create strategy: ' + error.message);
    }
  };

  const handleBacktest = async () => {
    if (!strategy) {
      alert('Please create a strategy first');
      return;
    }

    setBacktesting(true);
    setBacktestProgress(0);
    
    try {
      const symbol = selectedStock.symbol.split('/')[0];
      const { startDate, endDate } = getBacktestDateRange(backtestPeriod);
      
      setBacktestProgress(20);
      
      // Fetch historical data
      const response = await fetch(
        `http://localhost:3000
        /api/history/${symbol}?fromDate=${startDate}&toDate=${endDate}&interval=ONE_DAY`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.status}`);
      }
      
      const historyData = await response.json();
      
      setBacktestProgress(40);
      
      if (historyData.success && historyData.data && historyData.data.length > 0) {
        // Run backtest
        const backtestResponse = await fetch('http://localhost:3001/api/grid-strategy/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedStock.symbol,
            config: strategy.config,
            historicalData: historyData.data,
            period: backtestPeriod,
            gridLevels: calculateGridLevels(),
            mode: form.mode,
            entryCondition: form.entryCondition,
            targetMethod: form.targetMethod,
            dateRange: { startDate, endDate }
          })
        });
        
        setBacktestProgress(80);
        
        if (!backtestResponse.ok) {
          throw new Error(`Backtest failed: ${backtestResponse.status}`);
        }
        
        const backtestData = await backtestResponse.json();
        
        if (backtestData.success) {
          setBacktestProgress(100);
          setBacktestResults(backtestData.results);
          
          setTimeout(() => {
            const results = backtestData.results.results;
            alert(`🎯 Backtest Completed!\n\n📊 Total Trades: ${results.totalTrades}\n💰 Total P&L: ₹${results.totalPnL.toFixed(2)}\n📈 ROI: ${results.roi.toFixed(2)}%\n🎯 Win Rate: ${results.winRate.toFixed(2)}%\n📉 Max Drawdown: ${results.maxDrawdown.toFixed(2)}%`);
          }, 500);
        } else {
          throw new Error(backtestData.message || 'Backtest failed');
        }
      } else {
        throw new Error('No historical data available for the selected period');
      }
    } catch (error) {
      console.error('Backtest failed:', error);
      alert('Backtest failed: ' + error.message);
    } finally {
      setBacktesting(false);
      setBacktestProgress(0);
    }
  };

  const startLiveTrading = async () => {
    if (!strategy) {
      alert('Please create a strategy first');
      return;
    }

    try {
      setLiveTrading(true);
      setIsRunning(true);

      const response = await fetch('http://localhost:3001/api/grid-strategy/start-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: strategy,
          userEmail: 'kukrejaaryansh297@gmail.com',
          emailNotifications: emailNotifications
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setStrategy(prev => ({ ...prev, status: 'LIVE' }));
        
        alert(`🚀 Live Trading Started!\n\n📊 Strategy: ${strategy.strategyId}\n📈 Symbol: ${selectedStock.symbol.split('/')[0]}\n🎯 Grid Levels: ${calculateGridLevels().length}\n💰 Investment: ₹${form.investment.toLocaleString()}\n${emailNotifications ? '📧 Email notifications: Enabled' : '📧 Email notifications: Disabled'}\n\n🤖 Bot will automatically execute orders when price hits grid levels!`);
      } else {
        throw new Error(result.message || 'Failed to start live trading');
      }
    } catch (error) {
      console.error('Error starting live trading:', error);
      alert('Failed to start live trading: ' + error.message);
      setLiveTrading(false);
      setIsRunning(false);
    }
  };

  const stopLiveTrading = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/grid-strategy/stop-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: strategy.strategyId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setLiveTrading(false);
        setIsRunning(false);
        setStrategy(prev => ({ ...prev, status: 'STOPPED' }));
        alert('🛑 Live trading stopped successfully.');
      } else {
        throw new Error(result.message || 'Failed to stop live trading');
      }
    } catch (error) {
      console.error('Error stopping live trading:', error);
      alert('Failed to stop live trading: ' + error.message);
    }
  };

  const gridLevels = calculateGridLevels();
  const qtyPerLevel = form.qtyPerOrder === 0
    ? selectedStock.price > 0 
      ? (form.investment / form.levels / selectedStock.price).toFixed(4)
      : '0'
    : form.qtyPerOrder.toFixed(4);

  return (
    <aside className="config-sidebar">
      <h3>🤖 Advanced Grid Trading Bot</h3>
      <div className={`status ${isRunning ? "running" : "stopped"}`}>
        Bot Status: {isRunning ? "🟢 LIVE TRADING" : "🔴 STOPPED"}
        {liveTrading && <span className="live-indicator"> • 📡 AUTO-MONITORING</span>}
      </div>

      <form onSubmit={createStrategy}>
        <fieldset>
          <legend>🎯 Grid Configuration</legend>

          <div>
            <label>Grid Distribution Type</label>
            <select
              name="gridType"
              value={form.gridType}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="Arithmetic">Arithmetic (Linear)</option>
              <option value="Geometric">Geometric (Exponential)</option>
            </select>
          </div>

          <div>
            <label>Trading Mode</label>
            <select
              name="mode"
              value={form.mode}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="Neutral">🔄 Neutral (Buy & Sell)</option>
              <option value="Long">📈 Long Only</option>
              <option value="Short">📉 Short Only</option>
            </select>
          </div>

          <div>
            <label>Entry Condition</label>
            <select
              name="entryCondition"
              value={form.entryCondition}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="Crossing">🎯 Crossing (Immediate)</option>
              <option value="Pullback">🔄 Pullback (Wait for Retest)</option>
            </select>
          </div>

          <div>
            <label>Target Method</label>
            <select
              name="targetMethod"
              value={form.targetMethod}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="Exchange">🏢 Exchange Style</option>
              <option value="Increased Average Tp">📊 Increased Average TP</option>
            </select>
          </div>

          <div>
            <label>Upper Price Range</label>
            <input
              type="number"
              name="upperPrice"
              value={form.upperPrice}
              onChange={handleChange}
              step="0.01"
              min="0"
              disabled={isRunning}
              required
            />
          </div>

          <div>
            <label>Lower Price Range</label>
            <input
              type="number"
              name="lowerPrice"
              value={form.lowerPrice}
              onChange={handleChange}
              step="0.01"
              min="0"
              disabled={isRunning}
              required
            />
          </div>

          <div>
            <label>Number of Grid Levels</label>
            <input
              type="number"
              name="levels"
              value={form.levels}
              onChange={handleChange}
              min="2"
              max="50"
              disabled={isRunning}
              required
            />
            <small>Exactly {form.levels} levels will be created</small>
          </div>

          <div>
            <label>Total Investment Amount</label>
            <input
              type="number"
              name="investment"
              value={form.investment}
              onChange={handleChange}
              step="0.01"
              min="1000"
              disabled={isRunning}
              required
            />
          </div>

          <div>
            <label>Quantity per Order (Auto if 0)</label>
            <input
              type="number"
              name="qtyPerOrder"
              value={form.qtyPerOrder}
              onChange={handleChange}
              step="0.0001"
              min="0"
              disabled={isRunning}
            />
            <small>Auto: ~{qtyPerLevel} per level</small>
          </div>
        </fieldset>

        {/* Grid Preview - Shows exact number of levels */}
        {gridLevels.length > 0 && selectedStock.price > 0 && (
          <fieldset>
            <legend>📊 Grid Preview ({gridLevels.length} levels)</legend>
            <div className="grid-preview">
              <div className="grid-levels-container">
                {gridLevels.slice(0, 8).map((level, i) => (
                  <div 
                    key={i} 
                    className={`grid-level ${
                      level < selectedStock.price ? 'buy-level' : 
                      level > selectedStock.price ? 'sell-level' : 'current-level'
                    }`}
                  >
                    <span className="level-number">{i + 1} </span>
                    <span className="level-price">₹{level.toFixed(2)}</span>
                    <span className="level-type">
                      {level < selectedStock.price ? '🟢 BUY' : 
                       level > selectedStock.price ? '🔴 SELL' : '🟡 CURRENT'}
                    </span>
                    <span className="level-distance">
                      {((level - selectedStock.price) / selectedStock.price * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
                {gridLevels.length > 8 && (
                  <div className="more-levels">... and {gridLevels.length - 8} more levels</div>
                )}
              </div>
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend>⚠️ Risk Management</legend>

          <div>
            <label>Stop Loss Price (0 = disabled)</label>
            <input
              type="number"
              name="stopLoss"
              value={form.stopLoss}
              onChange={handleChange}
              step="0.01"
              min="0"
              disabled={isRunning}
            />
          </div>

          <div>
            <label>Take Profit % PnL (0 = disabled)</label>
            <input
              type="number"
              name="takeProfit"
              value={form.takeProfit}
              onChange={handleChange}
              step="0.1"
              min="0"
              max="1000"
              disabled={isRunning}
            />
            <small>Closes all positions at this profit %</small>
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                disabled={isRunning}
              />
              📧 Email Notifications
            </label>
            <small>Get notified when orders are filled automatically</small>
          </div>
        </fieldset>

        <div className="button-group">
          <button 
            type="submit" 
            className="create-btn" 
            disabled={isRunning || !selectedStock.symbol}
          >
            {strategy ? '🔄 Update Strategy' : '✨ Create Grid Strategy'}
          </button>

          {strategy && !isRunning && (
            <button 
              type="button"
              className="start-live-btn" 
              onClick={startLiveTrading}
              disabled={!strategy}
            >
              🚀 Start Live Trading
            </button>
          )}

          {strategy && isRunning && (
            <button 
              type="button"
              className="stop-live-btn" 
              onClick={stopLiveTrading}
            >
              ⏹️ Stop Live Trading
            </button>
          )}

          <button 
            type="button"
            className="backtest-btn"
            onClick={() => setShowBacktestModal(true)}
            disabled={!strategy || backtesting}
          >
            📊 {backtesting ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </form>

      {/* Backtest Modal */}
      {showBacktestModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>📊 Strategy Backtest</h3>
            
            {backtesting && (
              <div className="backtest-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${backtestProgress}%` }}
                  ></div>
                </div>
                <p>Running backtest... {backtestProgress}%</p>
              </div>
            )}
            
            <div className="backtest-options">
              <h4>Select Backtest Period</h4>
              {['1W', '1M', '3M', '6M'].map(period => (
                <label key={period}>
                  <input
                    type="radio"
                    value={period}
                    checked={backtestPeriod === period}
                    onChange={(e) => setBacktestPeriod(e.target.value)}
                    disabled={backtesting}
                  />
                  {period === '1W' ? '1 Week' :
                   period === '1M' ? '1 Month' :
                   period === '3M' ? '3 Months' :
                   period === '6M' ? '6 Months':''}
                </label>
              ))}
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={handleBacktest}
                disabled={backtesting}
                className="run-backtest-btn"
              >
                {backtesting ? '⏳ Running Backtest...' : '🚀 Run Backtest'}
              </button>
              <button 
                onClick={() => setShowBacktestModal(false)}
                className="cancel-btn"
                disabled={backtesting}
              >
                Cancel
              </button>
            </div>
            
            {/* Backtest Results */}
            {backtestResults && (
              <div className="backtest-results">
                <h4>🎯 Backtest Results ({backtestPeriod})</h4>
                <div className="results-grid">
                  <div className="result-section">
                    <h5>📈 Performance Metrics</h5>
                    <div className="result-item">
                      <span>Total P&L:</span>
                      <span className={backtestResults.results.totalPnL >= 0 ? 'profit' : 'loss'}>
                        ₹{backtestResults.results.totalPnL.toFixed(2)}
                      </span>
                    </div>
                    <div className="result-item">
                      <span>ROI:</span>
                      <span className={backtestResults.results.roi >= 0 ? 'profit' : 'loss'}>
                        {backtestResults.results.roi.toFixed(2)}%
                      </span>
                    </div>
                    <div className="result-item">
                      <span>Max Drawdown:</span>
                      <span className="loss">{backtestResults.results.maxDrawdown.toFixed(2)}%</span>
                    </div>
                    <div className="result-item">
                      <span>Sharpe Ratio:</span>
                      <span>{backtestResults.results.sharpeRatio?.toFixed(2) || 'N/A'}</span>
                    </div>
                  </div>
                  
                  <div className="result-section">
                    <h5>📊 Trading Statistics</h5>
                    <div className="result-item">
                      <span>Total Trades:</span>
                      <span>{backtestResults.results.totalTrades}</span>
                    </div>
                    <div className="result-item">
                      <span>Winning Trades:</span>
                      <span className="profit">{backtestResults.results.winningTrades}</span>
                    </div>
                    <div className="result-item">
                      <span>Losing Trades:</span>
                      <span className="loss">{backtestResults.results.losingTrades}</span>
                    </div>
                    <div className="result-item">
                      <span>Win Rate:</span>
                      <span className={backtestResults.results.winRate >= 50 ? 'profit' : 'loss'}>
                        {backtestResults.results.winRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                {backtestResults.trades && backtestResults.trades.length > 0 && (
                  <div className="trades-summary">
                    <h5>📋 Recent Trades (Last 10)</h5>
                    <div className="trades-list">
                      {backtestResults.trades.slice(-10).map((trade, index) => (
                        <div key={index} className="trade-item">
                          <span className={`trade-type ${trade.type.toLowerCase()}`}>
                            {trade.type}
                          </span>
                          <span>₹{trade.price.toFixed(2)}</span>
                          <span>Qty: {trade.quantity.toFixed(4)}</span>
                          <span className={trade.pnl >= 0 ? 'profit' : 'loss'}>
                            P&L: ₹{trade.pnl.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strategy Summary */}
      {strategy && (
        <div className="strategy-summary">
          <h4>🎯 Active Strategy Details</h4>
          <div className="strategy-details">
            <p><strong>Symbol:</strong> {strategy.stockSymbol}</p>
            <p><strong>Mode:</strong> {form.mode}</p>
            <p><strong>Grid Levels:</strong> {gridLevels.length}</p>
            <p><strong>Investment:</strong> ₹{strategy.config.investment.toLocaleString()}</p>
            <p><strong>Distribution:</strong> {form.gridType}</p>
            <p><strong>Entry Condition:</strong> {form.entryCondition}</p>
            <p><strong>Target Method:</strong> {form.targetMethod}</p>
            <p><strong>Status:</strong> 
              <span className={`status-badge ${strategy.status.toLowerCase()}`}>
                {strategy.status}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Live Monitoring Data */}
      {liveTrading && monitoringData && (
        <div className="monitoring-panel">
          <h4>📊 Live Performance</h4>
          <div className="monitoring-stats">
            <div className="stat-item">
              <span>Total P&L:</span>
              <span className={monitoringData.totalPnL >= 0 ? 'profit' : 'loss'}>
                ₹{monitoringData.totalPnL.toFixed(2)}
              </span>
            </div>
            <div className="stat-item">
              <span>ROI:</span>
              <span className={monitoringData.roi >= 0 ? 'profit' : 'loss'}>
                {monitoringData.roi.toFixed(2)}%
              </span>
            </div>
            <div className="stat-item">
              <span>Filled Orders:</span>
              <span>{monitoringData.filledOrders}</span>
            </div>
            <div className="stat-item">
              <span>Pending Orders:</span>
              <span>{monitoringData.pendingOrders}</span>
            </div>
          </div>
        </div>
      )}

      {/* Automated Trading Notice */}
      {liveTrading && (
        <div className="automation-notice">
          <h4>🤖 Automated Trading Active</h4>
          <p>✅ Orders are being executed automatically</p>
          <p>📧 Email notifications: {emailNotifications ? 'Enabled' : 'Disabled'}</p>
          <p>📊 Monitoring {gridLevels.length} grid levels</p>
          <small>The bot will automatically buy/sell when price hits grid levels</small>
        </div>
      )}
    </aside>
  );
}

export default ConfigSidebar;
