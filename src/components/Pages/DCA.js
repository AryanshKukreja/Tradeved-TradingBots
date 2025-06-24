import React, { useState, useEffect } from "react";
import Navbar from '../Navbar';
import Sidebar from './components/Sidebar';
import ConfigSidebar from './components/ConfigSidebar2';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine, ComposedChart, Bar } from 'recharts';
import "./DCA.css";

// DCA Chart Component (unchanged)
const DCAChart = ({ data, currentPrice, selectedStock, dcaOrders = [] }) => {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="tooltip-date">{data.date}</p>
          <p className="tooltip-time">{data.time}</p>
          <div className="tooltip-prices">
            <p><span className="tooltip-label">Price:</span> ₹{data.close?.toFixed(2)}</p>
            <p><span className="tooltip-label">Volume:</span> {(data.volume / 1000000).toFixed(2)}M</p>
            <p className={`tooltip-change ${data.change >= 0 ? 'positive' : 'negative'}`}>
              <span className="tooltip-label">Change:</span> 
              {data.change >= 0 ? '+' : ''}₹{data.change?.toFixed(2)} 
              ({data.changePercent?.toFixed(2)}%)
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={450}>
      <ComposedChart 
        data={data} 
        margin={{ top: 20, right: 40, left: 70, bottom: 20 }}
      >
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.6}/>
            <stop offset="95%" stopColor="#00D4AA" stopOpacity={0.1}/>
          </linearGradient>
          
          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FFD700" stopOpacity={0.6}/>
            <stop offset="95%" stopColor="#FFD700" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        
        <CartesianGrid strokeDasharray="2 2" stroke="#333" opacity={0.4} />
        
        <XAxis 
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(timestamp) => {
            const date = new Date(timestamp);
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }}
          stroke="#888"
          fontSize={11}
          interval="preserveStartEnd"
        />
        
        <YAxis 
          yAxisId="price"
          domain={['dataMin - 20', 'dataMax + 20']}
          stroke="#888"
          fontSize={11}
          tickFormatter={(value) => `₹${value.toFixed(0)}`}
          width={70}
        />
        
        <YAxis 
          yAxisId="volume"
          orientation="right"
          domain={[0, 'dataMax']}
          tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
          stroke="#666"
          fontSize={10}
          width={50}
        />
        
        <Tooltip content={<CustomTooltip />} />
        
        {currentPrice > 0 && (
          <ReferenceLine
            yAxisId="price"
            y={currentPrice}
            stroke="#FFD700"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        
        {dcaOrders.map((order, index) => (
          <ReferenceLine
            key={index}
            yAxisId="price"
            y={order.fillPrice || order.price}
            stroke={order.type === 'BUY' ? '#00D4AA' : '#FF6B6B'}
            strokeWidth={1}
            strokeOpacity={0.7}
          />
        ))}
        
        <Bar
          yAxisId="volume"
          dataKey="volume"
          fill="url(#volumeGradient)"
          opacity={0.6}
          radius={[1, 1, 0, 0]}
        />
        
        <Area
          yAxisId="price"
          type="monotone"
          dataKey="close"
          stroke="#00D4AA"
          strokeWidth={2}
          fill="url(#priceGradient)"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// Main Content Component
function MainContent({
  selectedStock,
  isRunning,
  toggleStrategy,
  monitoringData,
  executedOrders,
  pendingOrders,
  currentStrategy,
  liveTrading
}) {
  const [activeChart, setActiveChart] = useState("1M");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHistoricalData = async () => {
      if (!selectedStock.symbol) return;
      
      setLoading(true);
      try {
        const stockSymbol = selectedStock.symbol.split('/')[0];
        const response = await fetch(`http://localhost:3000/api/history/${stockSymbol}`);
        const data = await response.json();
        
        if (data.success && data.data) {
          const transformedData = data.data.map(item => ({
            timestamp: new Date(item.timestamp).getTime(),
            date: new Date(item.timestamp).toLocaleDateString(),
            time: new Date(item.timestamp).toLocaleTimeString(),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
            change: item.close - item.open,
            changePercent: ((item.close - item.open) / item.open) * 100
          }));
          
          const now = new Date();
          let filteredData = transformedData;
          
          switch (activeChart) {
            case "1W":
              const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              filteredData = transformedData.filter(item => 
                new Date(item.timestamp) >= oneWeekAgo
              );
              break;
            case "1M":
              const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              filteredData = transformedData.filter(item => 
                new Date(item.timestamp) >= oneMonthAgo
              );
              break;
            case "3M":
              const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
              filteredData = transformedData.filter(item => 
                new Date(item.timestamp) >= threeMonthsAgo
              );
              break;
            default:
              filteredData = transformedData;
          }
          
          setChartData(filteredData);
        }
      } catch (error) {
        console.error('Error fetching historical data:', error);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, [selectedStock.symbol, activeChart]);

  return (
    <main className="main-content">
      <section className="price-header">
        <div>
          <h2 id="selected-pair">{selectedStock.symbol}</h2>
          <div className="price-info">
            <span id="selected-price">₹{selectedStock.price}</span>
            <span
              id="selected-change"
              className={"change " + (selectedStock.change >= 0 ? "up" : "down")}
            >
              {selectedStock.change >= 0 ? "▲" : "▼"}{" "}
              {selectedStock.change >= 0 ? "+" : ""}
              {selectedStock.change.toFixed(2)}%
            </span>
            <span className="change-label">24h Change</span>
          </div>
        </div>
        <div>
          <button
            onClick={toggleStrategy}
            className={isRunning ? "pause-btn" : "start-btn"}
            disabled={!currentStrategy}
          >
            {isRunning ? "⏸ Stop DCA Trading" : "▶ Start DCA Trading"}
          </button>
          <button title="Settings" className="settings-btn">⚙️</button>
        </div>
      </section>

      <section className="stats-cards">
        <div className="card">
          <div>Total P&L</div>
          <div id="total-pnl" className={monitoringData.totalPnL >= 0 ? "stat-green" : "stat-red"}>
            ₹{monitoringData.totalPnL.toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div>ROI</div>
          <div id="roi" className={monitoringData.roi >= 0 ? "stat-green" : "stat-red"}>
            {monitoringData.roi}%
          </div>
        </div>
        <div className="card">
          <div>Executed Orders</div>
          <div id="executed-orders-count">{monitoringData.executedOrders}</div>
        </div>
        <div className="card">
          <div>Average Price</div>
          <div>₹{monitoringData.averagePrice?.toFixed(2) || 0}</div>
        </div>
        <div className="card">
          <div>Total Investment</div>
          <div>₹{monitoringData.totalInvestment?.toLocaleString() || 0}</div>
        </div>
        <div className="card">
          <div>Total Quantity</div>
          <div>{monitoringData.totalQuantity?.toFixed(4) || 0}</div>
        </div>
      </section>

      <section className="chart-section">
        <div className="chart-header">
          <div>
            <h3>📊 DCA Price Chart - {selectedStock.symbol.split('/')[0]}</h3>
            <p className="chart-info">
              {chartData.length > 0 && (
                <>
                  Showing {chartData.length} data points • 
                  Range: ₹{Math.min(...chartData.map(d => d.low)).toFixed(2)} - 
                  ₹{Math.max(...chartData.map(d => d.high)).toFixed(2)}
                  {executedOrders.length > 0 && (
                    <> • <span className="dca-orders-count">{executedOrders.length} DCA Orders Executed</span></>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="chart-controls">
            {["1W", "1M", "3M"].map(label => (
              <button
                key={label}
                className={`chart-btn ${activeChart === label ? "active" : ""}`}
                onClick={() => setActiveChart(label)}
                disabled={loading}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="chart-container">
          {loading ? (
            <div className="chart-loading">
              <div className="loading-spinner"></div>
              <p>Loading DCA chart data...</p>
            </div>
          ) : chartData.length > 0 ? (
            <DCAChart 
              data={chartData}
              currentPrice={selectedStock.price}
              selectedStock={selectedStock}
              dcaOrders={executedOrders}
            />
          ) : (
            <div className="chart-placeholder">
              <span style={{ fontSize: "3em", color: "#888" }}>📈</span>
              <p>No chart data available</p>
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Please select a stock to view DCA chart data
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="orders-section">
        <div>
          <h3>Executed DCA Orders ({executedOrders.length})</h3>
          <div className="orders-table-container">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Amount</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {executedOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-orders">
                      <div className="no-orders-content">
                        <p>No DCA orders executed yet</p>
                        <small>Orders will appear here when DCA schedule executes</small>
                      </div>
                    </td>
                  </tr>
                ) : (
                  executedOrders.map(order => (
                    <tr key={order.orderId || order._id} className="order-row">
                      <td>
                        <div className="stock-info">
                          <strong>{order.symbol || 'N/A'}</strong>
                        </div>
                      </td>
                      <td>
                        <span className={`order-type ${order.type === "BUY" ? "buy" : "sell"}`}>
                          {order.type}
                        </span>
                      </td>
                      <td className="price-cell">₹{order.fillPrice?.toFixed(2) || order.price?.toFixed(2) || 'N/A'}</td>
                      <td className="qty-cell">{order.quantity?.toFixed(4) || 'N/A'}</td>
                      <td className="amount-cell">₹{((order.fillPrice || order.price) * order.quantity)?.toFixed(2) || 'N/A'}</td>
                      <td className="time-cell">
                        {order.fillTime ? 
                          new Date(order.fillTime).toLocaleString() : 
                          new Date(order.timestamp).toLocaleString()
                        }
                      </td>
                      <td>
                        <span className="status-badge filled">EXECUTED</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {liveTrading && isRunning && (
        <section className="live-status enhanced-live-status">
          <div className="live-indicator">
            <span className="live-dot pulsing"></span>
            <div className="live-content">
              <span className="live-title">🚀 DCA Live Trading Active</span>
              <div className="live-details">
                <span>Monitoring: {selectedStock.symbol} • Price: ₹{selectedStock.price}</span>
                <span>Email: kukrejaaryansh297@gmail.com • Notifications: ON</span>
                <span>Strategy: {currentStrategy?.strategyId || 'N/A'}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// FIXED: Main DCA Component with Proper Variable Declaration Order
function DCA() {
  // State declarations FIRST
  const [selectedPair, setSelectedPair] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [stockPairs, setStockPairs] = useState([]);
  const [socket, setSocket] = useState(null);
  const [currentStrategy, setCurrentStrategy] = useState(null);
  const [executedOrders, setExecutedOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [liveTrading, setLiveTrading] = useState(false);
  const [monitoringData, setMonitoringData] = useState({
    totalPnL: 0,
    roi: 0,
    executedOrders: 0,
    pendingOrders: 0,
    totalInvestment: 0,
    currentValue: 0,
    averagePrice: 0,
    totalQuantity: 0
  });

  // CRITICAL FIX: Calculate selectedStock BEFORE useEffect hooks
  const selectedStock = stockPairs.find(s => s.symbol === selectedPair) || 
    (stockPairs.length > 0 ? stockPairs[0] : { symbol: "", price: 0, change: 0, volume: 0 });

  // Helper function for data sanitization
  const sanitizeChangePercent = (ltp, close, rawChangePercent) => {
    if (!ltp || !close || close === 0) return 0;
    const calculated = ((ltp - close) / close) * 100;
    if (Math.abs(rawChangePercent) > 100) return calculated;
    return rawChangePercent;
  };

  // Load active strategies
  useEffect(() => {
    const loadActiveStrategies = async () => {
      try {
        const response = await fetch('http://localhost:3002/api/dca-strategies/active');
        const data = await response.json();
        
        if (data.success && data.strategies.length > 0) {
          const strategy = data.strategies[0];
          setCurrentStrategy(strategy);
          setIsRunning(strategy.status === 'ACTIVE');
          setLiveTrading(strategy.status === 'ACTIVE');
          
          if (strategy.orders) {
            setExecutedOrders(strategy.orders.executed || []);
            setPendingOrders(strategy.orders.pending || []);
          }
          
          if (strategy.monitoring) {
            setMonitoringData(prev => ({
              ...prev,
              ...strategy.monitoring
            }));
          }
          
          console.log('✅ Loaded active DCA strategy:', strategy.strategyId);
        }
      } catch (error) {
        console.error('Error loading active DCA strategies:', error);
      }
    };

    loadActiveStrategies();
  }, []);

  // Fetch symbols and setup WebSocket
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/symbols');
        const data = await response.json();

        if (data.success && data.data) {
          const initialStocks = data.data.map(stock => {
            const ltp = stock.liveData?.ltp || 0;
            const close = stock.liveData?.close || 0;
            const rawChangePercent = stock.liveData?.changePercent || 0;

            return {
              symbol: `${stock.symbol}/INR`,
              price: ltp,
              change: sanitizeChangePercent(ltp, close, rawChangePercent),
              volume: stock.liveData?.volume || 0
            };
          });

          setStockPairs(initialStocks);
          if (initialStocks.length > 0 && !selectedPair) {
            setSelectedPair(initialStocks[0].symbol);
          }
        }
      } catch (error) {
        console.error('Error fetching symbols:', error);
      }
    };

    fetchSymbols();

    // WebSocket connection
    const ws = new WebSocket('ws://localhost:3002');

    ws.onopen = () => {
      console.log('DCA WebSocket connected');
      setSocket(ws);
      
      if (currentStrategy) {
        ws.send(JSON.stringify({
          type: 'subscribe-strategy',
          strategyId: currentStrategy.strategyId
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        
        if (update.success && update.data) {
          setStockPairs(prev =>
            prev.map(stock =>
              stock.symbol.startsWith(update.data.symbol)
                ? {
                    ...stock,
                    price: update.data.ltp,
                    change: sanitizeChangePercent(update.data.ltp, update.data.close, update.data.changePercent)
                  }
                : stock
            )
          );
        }
        
        if (update.type === 'dca-strategy-update') {
          if (update.data.type === 'order_executed') {
            const executedOrder = update.data.order;
            setExecutedOrders(prev => [...prev, executedOrder]);
            console.log('💰 DCA Order executed via WebSocket:', executedOrder);
          } else if (update.data.type === 'monitoring_update') {
            setMonitoringData(prev => ({
              ...prev,
              ...update.data.monitoring
            }));
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('DCA WebSocket error:', error);
    };

    return () => {
      if (ws) {
        ws.close();
        console.log('DCA WebSocket disconnected');
      }
    };
  }, [selectedPair, currentStrategy]);

  // Update monitoring data when orders change
  useEffect(() => {
    if (executedOrders.length > 0 && selectedStock.price) {
      const totalInvestment = executedOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
      const totalQuantity = executedOrders.reduce((sum, order) => sum + (order.quantity || 0), 0);
      const averagePrice = totalQuantity > 0 ? totalInvestment / totalQuantity : 0;
      
      const currentPrice = selectedStock.price || 0;
      const currentValue = totalQuantity * currentPrice;
      const totalPnL = currentValue - totalInvestment;
      const roi = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

      setMonitoringData(prev => ({
        ...prev,
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        executedOrders: executedOrders.length,
        totalInvestment: parseFloat(totalInvestment.toFixed(2)),
        currentValue: parseFloat(currentValue.toFixed(2)),
        averagePrice: parseFloat(averagePrice.toFixed(2)),
        totalQuantity: parseFloat(totalQuantity.toFixed(4))
      }));
    }
  }, [executedOrders, selectedStock.price]);

  // Periodic order refresh
  useEffect(() => {
    if (!currentStrategy || !isRunning) return;
    
    const refreshOrders = async () => {
      try {
        const response = await fetch(`http://localhost:3002/api/dca-strategy/${currentStrategy.strategyId}/orders`);
        const data = await response.json();
        
        if (data.success) {
          setExecutedOrders(data.orders.executed);
          setPendingOrders(data.orders.pending);
        }
      } catch (error) {
        console.error('Error refreshing DCA orders:', error);
      }
    };

    const interval = setInterval(refreshOrders, 10000);
    return () => clearInterval(interval);
  }, [currentStrategy, isRunning]);

  const toggleStrategy = async () => {
    if (!currentStrategy) {
      alert('Please create a DCA strategy first');
      return;
    }

    try {
      if (!isRunning) {
        const response = await fetch('http://localhost:3002/api/dca-strategy/start-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategy: {
              id: currentStrategy.strategyId,
              stockSymbol: currentStrategy.symbol,
              config: currentStrategy.config
            },
            userEmail: 'kukrejaaryansh297@gmail.com',
            emailNotifications: true
          })
        });

        const result = await response.json();
        
        if (result.success) {
          setLiveTrading(true);
          setIsRunning(true);
          setCurrentStrategy(prev => ({ ...prev, status: 'ACTIVE' }));
          console.log('🚀 DCA live trading started successfully');
          
          if (socket) {
            socket.send(JSON.stringify({
              type: 'subscribe-strategy',
              strategyId: currentStrategy.strategyId
            }));
          }
        } else {
          throw new Error(result.message || 'Failed to start DCA live trading');
        }
      } else {
        const response = await fetch('http://localhost:3002/api/dca-strategy/stop-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId: currentStrategy.strategyId })
        });

        const result = await response.json();
        
        if (result.success) {
          setLiveTrading(false);
          setIsRunning(false);
          setCurrentStrategy(prev => ({ ...prev, status: 'STOPPED' }));
          console.log('🛑 DCA live trading stopped successfully');
        }
      }
    } catch (error) {
      console.error('Error toggling DCA strategy:', error);
      alert('Failed to toggle DCA strategy: ' + error.message);
      setLiveTrading(false);
      setIsRunning(false);
    }
  };

  const handleStrategyUpdate = (strategy) => {
    setCurrentStrategy(strategy);
    console.log('DCA Strategy updated:', strategy);
  };

  const handleOrdersUpdate = (orders) => {
    const executed = orders.filter(order => order.status === 'EXECUTED');
    const pending = orders.filter(order => order.status === 'PENDING');
    
    setExecutedOrders(executed);
    setPendingOrders(pending);
    
    console.log('DCA Orders updated:', { executed: executed.length, pending: pending.length });
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="container">
        <Sidebar
          stockPairs={stockPairs}
          selectedPair={selectedPair}
          selectStock={setSelectedPair}
          search={search}
          setSearch={setSearch}
        />
        <MainContent
          selectedStock={selectedStock}
          isRunning={isRunning}
          toggleStrategy={toggleStrategy}
          monitoringData={monitoringData}
          executedOrders={executedOrders}
          pendingOrders={pendingOrders}
          currentStrategy={currentStrategy}
          liveTrading={liveTrading}
        />
        <ConfigSidebar 
          isRunning={isRunning}
          setIsRunning={setIsRunning}
          selectedStock={selectedStock}
          onStrategyUpdate={handleStrategyUpdate}
          onOrdersUpdate={handleOrdersUpdate}
        />
      </div>
    </div>
  );
}

export default DCA;
