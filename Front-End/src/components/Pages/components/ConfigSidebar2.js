import React, { useState, useEffect } from 'react';

function ConfigSidebar2({ 
  isRunning, 
  setIsRunning, 
  selectedStock, 
  onStrategyUpdate, 
  onOrdersUpdate 
}) {
  const [form, setForm] = useState(() => {
    const savedForm = localStorage.getItem('dcaStrategyForm');
    
    if (savedForm) {
      return JSON.parse(savedForm);
    } else {
      return {
        investmentAmount: 1000.0,
        frequency: 1, // Changed to 1 minute for testing
        frequencyUnit: 'minutes', // Changed default to 'minutes'
        startTime: (() => {
          const now = new Date();
          const timezoneOffset = now.getTimezoneOffset() * 60000;
          const localTime = new Date(now.getTime() - timezoneOffset);
          return localTime.toISOString().slice(0, 16);
        })(), // Set to current local time
        endCondition: 'orderCount', // 'orderCount', 'stopLoss', 'takeProfit', 'manual'
        maxOrders: 10,
        stopLoss: 0.0, // percentage
        takeProfit: 0.0, // percentage
        orderType: 'BUY', // DCA typically buys
        enableStopLoss: false,
        enableTakeProfit: false
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

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dcaStrategyForm', JSON.stringify(form));
  }, [form]);

  // Update form when stock changes
  useEffect(() => {
    if (selectedStock && selectedStock.price > 0) {
      const currentPrice = selectedStock.price;
      setForm(prev => ({
        ...prev,
        currentPrice: currentPrice
      }));
    }
  }, [selectedStock]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) =>
      type === "checkbox"
        ? { ...f, [name]: checked }
        : { ...f, [name]: type === "number" ? parseFloat(value) || 0 : value }
    );
  };

  // Function to set current date and time in local timezone
  const setCurrentDateTime = () => {
    const now = new Date();
    // Get local timezone offset and adjust for IST
    const timezoneOffset = now.getTimezoneOffset() * 60000; // Convert to milliseconds
    const localTime = new Date(now.getTime() - timezoneOffset);
    const currentDateTime = localTime.toISOString().slice(0, 16);
    setForm(prev => ({
      ...prev,
      startTime: currentDateTime
    }));
  };

  // Function to get frequency display text
  const getFrequencyDisplay = () => {
    if (form.frequencyUnit === 'minutes') {
      return form.frequency === 1 ? 'minute' : 'minutes';
    } else if (form.frequencyUnit === 'hours') {
      return form.frequency === 1 ? 'hour' : 'hours';
    } else {
      return form.frequency === 1 ? 'day' : 'days';
    }
  };

  // Function to get max frequency based on unit
  const getMaxFrequency = () => {
    switch (form.frequencyUnit) {
      case 'minutes':
        return 1440; // 24 hours in minutes
      case 'hours':
        return 168; // 7 days in hours
      case 'days':
        return 365; // 1 year in days
      default:
        return 1440;
    }
  };

  const createStrategy = async (e) => {
    e.preventDefault();
    
    try {
      const stockSymbol = selectedStock.symbol.split('/')[0];

      const strategyConfig = {
        investmentAmount: form.investmentAmount,
        frequency: form.frequency,
        frequencyUnit: form.frequencyUnit,
        startTime: form.startTime,
        endCondition: form.endCondition,
        maxOrders: form.maxOrders,
        stopLoss: form.enableStopLoss ? form.stopLoss : 0,
        takeProfit: form.enableTakeProfit ? form.takeProfit : 0,
        orderType: form.orderType,
        enableStopLoss: form.enableStopLoss,
        enableTakeProfit: form.enableTakeProfit
      };

      const response = await fetch('http://localhost:3002/api/dca-strategy/create', {
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
          type: 'dca',
          config: strategyConfig,
          status: 'created',
          createdAt: new Date().toISOString(),
          monitoring: {
            totalPnL: 0,
            roi: 0,
            executedOrders: 0,
            pendingOrders: 1,
            totalInvestment: 0,
            currentValue: 0,
            averagePrice: 0,
            totalQuantity: 0
          }
        };

        setStrategy(newStrategy);
        setOrders([]);
        
        onStrategyUpdate?.(newStrategy);
        onOrdersUpdate?.([]);
        
        console.log(`✅ DCA Strategy created successfully`);
        alert(`✅ DCA Strategy Created Successfully!\n\n💰 Investment per order: ₹${form.investmentAmount.toLocaleString()}\n⏰ Frequency: Every ${form.frequency} ${getFrequencyDisplay()}\n🎯 End condition: ${form.endCondition === 'orderCount' ? `${form.maxOrders} orders` : form.endCondition}\n📈 Order type: ${form.orderType}`);
      } else {
        throw new Error(result.message || 'Failed to create strategy');
      }

    } catch (error) {
      console.error('Error creating DCA strategy:', error);
      alert('Failed to create DCA strategy: ' + error.message);
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

      const response = await fetch('http://localhost:3002/api/dca-strategy/start-live', {
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
        
        alert(`🚀 DCA Live Trading Started!\n\n📊 Strategy: ${strategy.strategyId}\n📈 Symbol: ${selectedStock.symbol.split('/')[0]}\n💰 Investment per order: ₹${form.investmentAmount.toLocaleString()}\n⏰ Frequency: Every ${form.frequency} ${getFrequencyDisplay()}\n${emailNotifications ? '📧 Email notifications: Enabled' : '📧 Email notifications: Disabled'}\n\n🤖 Bot will automatically execute DCA orders at scheduled intervals!`);
      } else {
        throw new Error(result.message || 'Failed to start live trading');
      }
    } catch (error) {
      console.error('Error starting DCA live trading:', error);
      alert('Failed to start DCA live trading: ' + error.message);
      setLiveTrading(false);
      setIsRunning(false);
    }
  };

  const stopLiveTrading = async () => {
    try {
      const response = await fetch('http://localhost:3002/api/dca-strategy/stop-live', {
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
        alert('🛑 DCA live trading stopped successfully.');
      } else {
        throw new Error(result.message || 'Failed to stop live trading');
      }
    } catch (error) {
      console.error('Error stopping DCA live trading:', error);
      alert('Failed to stop DCA live trading: ' + error.message);
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
      
      const response = await fetch(
        `http://localhost:3002/api/history/${symbol}?fromDate=${startDate}&toDate=${endDate}&interval=ONE_DAY`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.status}`);
      }
      
      const historyData = await response.json();
      
      setBacktestProgress(40);
      
      if (historyData.success && historyData.data && historyData.data.length > 0) {
        const backtestResponse = await fetch('http://localhost:3002/api/dca-strategy/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedStock.symbol,
            config: strategy.config,
            historicalData: historyData.data,
            period: backtestPeriod,
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
            alert(`🎯 DCA Backtest Completed!\n\n📊 Total Orders: ${results.totalOrders}\n💰 Total Investment: ₹${results.totalInvestment.toFixed(2)}\n📈 Average Price: ₹${results.averagePrice.toFixed(2)}\n💼 Total Quantity: ${results.totalQuantity.toFixed(4)}\n📊 Current Value: ₹${results.currentValue.toFixed(2)}\n💰 Total P&L: ₹${results.totalPnL.toFixed(2)}\n📈 ROI: ${results.roi.toFixed(2)}%`);
          }, 500);
        } else {
          throw new Error(backtestData.message || 'Backtest failed');
        }
      } else {
        throw new Error('No historical data available for the selected period');
      }
    } catch (error) {
      console.error('DCA Backtest failed:', error);
      alert('DCA Backtest failed: ' + error.message);
    } finally {
      setBacktesting(false);
      setBacktestProgress(0);
    }
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

  return (
    <aside className="config-sidebar">
      <h3>🤖 Advanced DCA Trading Bot</h3>
      <div className={`status ${isRunning ? "running" : "stopped"}`}>
        Bot Status: {isRunning ? "🟢 LIVE TRADING" : "🔴 STOPPED"}
        {liveTrading && <span className="live-indicator"> • 📡 AUTO-MONITORING</span>}
      </div>

      <form onSubmit={createStrategy}>
        <fieldset>
          <legend>💰 DCA Configuration</legend>

          <div>
            <label>Investment Amount (Per Order)</label>
            <input
              type="number"
              name="investmentAmount"
              value={form.investmentAmount}
              onChange={handleChange}
              step="0.01"
              min="100"
              disabled={isRunning}
              required
            />
            <small>Amount to invest in each DCA order</small>
          </div>

          <div>
            <label>Frequency</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                name="frequency"
                value={form.frequency}
                onChange={handleChange}
                min="1"
                max={getMaxFrequency()}
                disabled={isRunning}
                required
                style={{ flex: 1 }}
              />
              <select
                name="frequencyUnit"
                value={form.frequencyUnit}
                onChange={handleChange}
                disabled={isRunning}
                style={{ flex: 1 }}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <small>Execute DCA order every {form.frequency} {getFrequencyDisplay()}</small>
          </div>

          <div>
            <label>Start Time</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="datetime-local"
                name="startTime"
                value={form.startTime}
                onChange={handleChange}
                disabled={isRunning}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={setCurrentDateTime}
                disabled={isRunning}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  whiteSpace: 'nowrap'
                }}
              >
                🕐 Now
              </button>
            </div>
            <small>When to begin DCA orders (use "Now" button for current time)</small>
          </div>

          <div>
            <label>End Condition</label>
            <select
              name="endCondition"
              value={form.endCondition}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="orderCount">📊 After X Orders</option>
              <option value="stopLoss">📉 Stop Loss Hit</option>
              <option value="takeProfit">📈 Take Profit Hit</option>
              <option value="manual">🔄 Manual Stop Only</option>
            </select>
          </div>

          {form.endCondition === 'orderCount' && (
            <div>
              <label>Maximum Orders</label>
              <input
                type="number"
                name="maxOrders"
                value={form.maxOrders}
                onChange={handleChange}
                min="1"
                max="100"
                disabled={isRunning}
                required
              />
              <small>Stop after executing this many orders</small>
            </div>
          )}

          <div>
            <label>Order Type</label>
            <select
              name="orderType"
              value={form.orderType}
              onChange={handleChange}
              disabled={isRunning}
            >
              <option value="BUY">📈 BUY (Accumulate)</option>
              <option value="SELL">📉 SELL (Distribute)</option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>⚠️ Risk Management</legend>

          <div>
            <label>
              <input
                type="checkbox"
                name="enableStopLoss"
                checked={form.enableStopLoss}
                onChange={handleChange}
                disabled={isRunning}
              />
              📉 Enable Stop Loss
            </label>
          </div>

          {form.enableStopLoss && (
            <div>
              <label>Stop Loss Percentage</label>
              <input
                type="number"
                name="stopLoss"
                value={form.stopLoss}
                onChange={handleChange}
                step="0.1"
                min="0.1"
                max="50"
                disabled={isRunning}
              />
              <small>Close position if loss exceeds this %</small>
            </div>
          )}

          <div>
            <label>
              <input
                type="checkbox"
                name="enableTakeProfit"
                checked={form.enableTakeProfit}
                onChange={handleChange}
                disabled={isRunning}
              />
              📈 Enable Take Profit
            </label>
          </div>

          {form.enableTakeProfit && (
            <div>
              <label>Take Profit Percentage</label>
              <input
                type="number"
                name="takeProfit"
                value={form.takeProfit}
                onChange={handleChange}
                step="0.1"
                min="0.1"
                max="1000"
                disabled={isRunning}
              />
              <small>Close position if profit exceeds this %</small>
            </div>
          )}

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
            <small>Get notified when DCA orders are executed</small>
          </div>
        </fieldset>

        <div className="button-group">
          <button 
            type="submit" 
            className="create-btn" 
            disabled={isRunning || !selectedStock.symbol}
          >
            {strategy ? '🔄 Update DCA Strategy' : '✨ Create DCA Strategy'}
          </button>

          {strategy && !isRunning && (
            <button 
              type="button"
              className="start-live-btn" 
              onClick={startLiveTrading}
              disabled={!strategy}
            >
              🚀 Start DCA Live Trading
            </button>
          )}

          {strategy && isRunning && (
            <button 
              type="button"
              className="stop-live-btn" 
              onClick={stopLiveTrading}
            >
              ⏹️ Stop DCA Live Trading
            </button>
          )}

          <button 
            type="button"
            className="backtest-btn"
            onClick={() => setShowBacktestModal(true)}
            disabled={!strategy || backtesting}
          >
            📊 {backtesting ? 'Running...' : 'Run DCA Backtest'}
          </button>
        </div>
      </form>

      {/* DCA Strategy Preview */}
      {strategy && (
        <div className="strategy-summary">
          <h4>🎯 Active DCA Strategy Details</h4>
          <div className="strategy-details">
            <p><strong>Symbol:</strong> {strategy.stockSymbol}</p>
            <p><strong>Investment per Order:</strong> ₹{form.investmentAmount.toLocaleString()}</p>
            <p><strong>Frequency:</strong> Every {form.frequency} {getFrequencyDisplay()}</p>
            <p><strong>Order Type:</strong> {form.orderType}</p>
            <p><strong>End Condition:</strong> {form.endCondition}</p>
            {form.endCondition === 'orderCount' && (
              <p><strong>Max Orders:</strong> {form.maxOrders}</p>
            )}
            <p><strong>Stop Loss:</strong> {form.enableStopLoss ? `${form.stopLoss}%` : 'Disabled'}</p>
            <p><strong>Take Profit:</strong> {form.enableTakeProfit ? `${form.takeProfit}%` : 'Disabled'}</p>
            <p><strong>Status:</strong> 
              <span className={`status-badge ${strategy.status.toLowerCase()}`}>
                {strategy.status}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Backtest Modal */}
      {showBacktestModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>📊 DCA Strategy Backtest</h3>
            
            {backtesting && (
              <div className="backtest-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${backtestProgress}%` }}
                  ></div>
                </div>
                <p>Running DCA backtest... {backtestProgress}%</p>
              </div>
            )}
            
            <div className="backtest-options">
              <h4>Select Backtest Period</h4>
              {['1W', '1M', '3M', '6M', '1Y'].map(period => (
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
                   period === '6M' ? '6 Months' :
                   period === '1Y' ? '1 Year' : ''}
                </label>
              ))}
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={handleBacktest}
                disabled={backtesting}
                className="run-backtest-btn"
              >
                {backtesting ? '⏳ Running DCA Backtest...' : '🚀 Run DCA Backtest'}
              </button>
              <button 
                onClick={() => setShowBacktestModal(false)}
                className="cancel-btn"
                disabled={backtesting}
              >
                Cancel
              </button>
            </div>
            
            {/* DCA Backtest Results */}
            {backtestResults && (
              <div className="backtest-results">
                <h4>🎯 DCA Backtest Results ({backtestPeriod})</h4>
                <div className="results-grid">
                  <div className="result-section">
                    <h5>📈 Performance Metrics</h5>
                    <div className="result-item">
                      <span>Total Investment:</span>
                      <span>₹{backtestResults.results.totalInvestment.toFixed(2)}</span>
                    </div>
                    <div className="result-item">
                      <span>Current Value:</span>
                      <span>₹{backtestResults.results.currentValue.toFixed(2)}</span>
                    </div>
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
                  </div>
                  
                  <div className="result-section">
                    <h5>📊 DCA Statistics</h5>
                    <div className="result-item">
                      <span>Total Orders:</span>
                      <span>{backtestResults.results.totalOrders}</span>
                    </div>
                    <div className="result-item">
                      <span>Average Price:</span>
                      <span>₹{backtestResults.results.averagePrice.toFixed(2)}</span>
                    </div>
                    <div className="result-item">
                      <span>Total Quantity:</span>
                      <span>{backtestResults.results.totalQuantity.toFixed(4)}</span>
                    </div>
                    <div className="result-item">
                      <span>Final Price:</span>
                      <span>₹{backtestResults.results.finalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Automated DCA Trading Notice */}
      {liveTrading && (
        <div className="automation-notice">
          <h4>🤖 Automated DCA Trading Active</h4>
          <p>✅ Orders are being executed automatically at scheduled intervals</p>
          <p>📧 Email notifications: {emailNotifications ? 'Enabled' : 'Disabled'}</p>
          <p>⏰ Next order in: {/* Calculate time until next order */}</p>
          <small>The bot will automatically execute DCA orders based on your schedule</small>
        </div>
      )}
    </aside>
  );
}

export default ConfigSidebar2;