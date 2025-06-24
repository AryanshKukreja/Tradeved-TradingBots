import React, { useState, useEffect } from "react";
import Navbar from '../Navbar';
import Sidebar from './components/Sidebar';
import ConfigSidebar from './components/ConfigSidebar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine, ComposedChart, Bar } from 'recharts';
import "./GRID.css";

// Custom Candlestick Component (keeping your existing implementation)
const CustomCandlestick = ({ payload, x, y, width, height }) => {
  if (!payload || !payload.open || !payload.close || !payload.high || !payload.low) {
    return null;
  }

  const { open, close, high, low } = payload;
  const isPositive = close >= open;
  const candleColor = isPositive ? '#00D4AA' : '#FF6B6B';
  const wickColor = '#888';
  
  const centerX = x + width / 2;
  const maxPrice = Math.max(high, low, open, close);
  const minPrice = Math.min(high, low, open, close);
  const priceRange = maxPrice - minPrice;
  
  if (priceRange === 0) return null;
  
  const scale = height / priceRange;
  const highY = y + (maxPrice - high) * scale;
  const lowY = y + (maxPrice - low) * scale;
  const openY = y + (maxPrice - open) * scale;
  const closeY = y + (maxPrice - close) * scale;
  
  const candleTop = Math.min(openY, closeY);
  const candleBottom = Math.max(openY, closeY);
  const candleHeight = Math.abs(closeY - openY);
  
  return (
    <g>
      <line
        x1={centerX}
        y1={highY}
        x2={centerX}
        y2={lowY}
        stroke={wickColor}
        strokeWidth={1}
      />
      <rect
        x={x + width * 0.2}
        y={candleTop}
        width={width * 0.6}
        height={Math.max(candleHeight, 1)}
        fill={candleColor}
        stroke={candleColor}
        strokeWidth={1}
        opacity={isPositive ? 0.8 : 1}
      />
    </g>
  );
};

// Enhanced CandlestickChart Component (keeping your existing implementation but adding real-time updates)
const CandlestickChart = ({ data, gridLevels, currentPrice, selectedStock }) => {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip candlestick-tooltip">
          <p className="tooltip-date">{data.date}</p>
          <p className="tooltip-time">{data.time}</p>
          <div className="tooltip-prices">
            <div className="ohlc-grid">
              <div className="ohlc-item">
                <span className="ohlc-label">O:</span>
                <span className="ohlc-value">₹{data.open?.toFixed(2)}</span>
              </div>
              <div className="ohlc-item">
                <span className="ohlc-label">H:</span>
                <span className="ohlc-value high">₹{data.high?.toFixed(2)}</span>
              </div>
              <div className="ohlc-item">
                <span className="ohlc-label">L:</span>
                <span className="ohlc-value low">₹{data.low?.toFixed(2)}</span>
              </div>
              <div className="ohlc-item">
                <span className="ohlc-label">C:</span>
                <span className={`ohlc-value ${data.change >= 0 ? 'positive' : 'negative'}`}>
                  ₹{data.close?.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="tooltip-secondary">
              <p><span className="tooltip-label">Volume:</span> {(data.volume / 1000000).toFixed(2)}M</p>
              <p className={`tooltip-change ${data.change >= 0 ? 'positive' : 'negative'}`}>
                <span className="tooltip-label">Change:</span> 
                {data.change >= 0 ? '+' : ''}₹{data.change?.toFixed(2)} 
                ({data.changePercent?.toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomYAxisTick = (props) => {
    const { x, y, payload } = props;
    const isGridLevel = gridLevels.some(level => 
      Math.abs(level.value - payload.value) < 1.0
    );
    
    const matchingGrid = gridLevels.find(level => 
      Math.abs(level.value - payload.value) < 1.0
    );
    
    const isCurrentPrice = Math.abs(currentPrice - payload.value) < 1.0;
    
    let textColor = '#888';
    let fontWeight = 'normal';
    let backgroundColor = 'transparent';
    
    if (isCurrentPrice) {
      textColor = '#FFD700';
      fontWeight = 'bold';
      backgroundColor = 'rgba(255, 215, 0, 0.1)';
    } else if (isGridLevel && matchingGrid) {
      textColor = matchingGrid.color;
      fontWeight = 'bold';
      backgroundColor = `${matchingGrid.color}15`;
    }
    
    return (
      <g transform={`translate(${x},${y})`}>
        {(isGridLevel || isCurrentPrice) && (
          <rect
            x={-60}
            y={-8}
            width={60}
            height={16}
            fill={backgroundColor}
            rx={2}
          />
        )}
        <text 
          x={-5} 
          y={0} 
          dy={4}
          textAnchor="end" 
          fill={textColor}
          fontSize="11"
          fontWeight={fontWeight}
        >
          ₹{payload.value.toFixed(0)}
        </text>
        {isGridLevel && matchingGrid && (
          <circle 
            cx={8} 
            cy={0} 
            r={3} 
            fill={matchingGrid.color}
            opacity={0.9}
            stroke="#fff"
            strokeWidth={1}
          />
        )}
        {isCurrentPrice && (
          <polygon
            points="8,0 12,-3 12,3"
            fill="#FFD700"
            opacity={0.9}
          />
        )}
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={450}>
      <ComposedChart 
        data={data} 
        margin={{ top: 20, right: 40, left: 70, bottom: 20 }}
      >
        <defs>
          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.6}/>
            <stop offset="95%" stopColor="#00D4AA" stopOpacity={0.1}/>
          </linearGradient>
          
          {gridLevels.map((level, index) => (
            <linearGradient key={`gridGradient-${index}`} id={`gridGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={level.color} stopOpacity={0.3}/>
              <stop offset="50%" stopColor={level.color} stopOpacity={0.6}/>
              <stop offset="100%" stopColor={level.color} stopOpacity={0.3}/>
            </linearGradient>
          ))}
        </defs>
        
        <CartesianGrid 
          strokeDasharray="2 2" 
          stroke="#333" 
          opacity={0.4}
          horizontalPoints={gridLevels.map(level => level.value)}
        />
        
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
          tick={<CustomYAxisTick />}
          stroke="#888"
          fontSize={11}
          tickLine={{ stroke: '#888' }}
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
        
        {gridLevels.map((gridLevel, index) => (
          <g key={`grid-zone-${index}`}>
            <ReferenceLine
              yAxisId="price"
              y={gridLevel.value}
              stroke={gridLevel.color}
              strokeWidth={3}
              strokeOpacity={0.3}
              strokeDasharray="none"
            />
            
            <ReferenceLine
              yAxisId="price"
              y={gridLevel.value}
              stroke={gridLevel.color}
              strokeWidth={2}
              strokeOpacity={0.9}
              strokeDasharray="8 4"
              label={{
                position: "topRight",
                fill: gridLevel.color,
                fontSize: 10,
                fontWeight: "bold",
                offset: 5,
                textAnchor: "end",
              }}
            />
          </g>
        ))}

        {currentPrice > 0 && (
          <g>
            <ReferenceLine
              yAxisId="price"
              y={currentPrice}
              stroke="#FFD700"
              strokeWidth={4}
              strokeOpacity={0.4}
              strokeDasharray="none"
            />
            <ReferenceLine
              yAxisId="price"
              y={currentPrice}
              stroke="#FFD700"
              strokeWidth={2}
              strokeDasharray="none"
              label={{
                position: "topRight",
                fill: "#FFD700",
                fontSize: 12,
                fontWeight: "bold",
                offset: 10,
                textAnchor: "end",
              }}
            />
          </g>
        )}
        
        <Bar
          yAxisId="volume"
          dataKey="volume"
          fill="url(#volumeGradient)"
          opacity={0.6}
          radius={[1, 1, 0, 0]}
        />
        
        <Line
          yAxisId="price"
          type="linear"
          dataKey="high"
          stroke="transparent"
          dot={false}
          strokeWidth={0}
        />
        
        <Area
          yAxisId="price"
          type="stepAfter"
          dataKey="close"
          stroke="#00D4AA"
          strokeWidth={1}
          fill="none"
          dot={(props) => {
            const { cx, cy, payload } = props;
            if (!payload) return null;
            
            const isPositive = payload.close >= payload.open;
            const color = isPositive ? '#00D4AA' : '#FF6B6B';
            
            return (
              <g>
                <line
                  x1={cx}
                  y1={cy - 10}
                  x2={cx}
                  y2={cy + 10}  
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.8}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1}
                />
              </g>
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// Enhanced Main Content Component
function MainContent({
  selectedStock,
  isRunning,
  toggleStrategy,
  monitoringData,
  filledOrders,
  pendingOrders,
  currentStrategy,
  liveTrading
}) {
  const [activeChart, setActiveChart] = useState("1D");
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch historical data when stock changes or chart period changes
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

  // Calculate grid levels for visualization
  const getGridLevels = () => {
    if (!currentStrategy?.gridLevels) return [];
    return currentStrategy.gridLevels.map((level, index) => ({
      value: level,
      label: `Grid ${index + 1}`,
      color: index % 2 === 0 ? '#00D4AA' : '#FF6B6B',
      type: level < selectedStock.price ? 'BUY' : level > selectedStock.price ? 'SELL' : 'CURRENT'
    }));
  };

  const gridLevels = getGridLevels();
  
  return (
    <main className="main-content">
      <section className="price-header">
        <div>
          <h2 id="selected-pair">{selectedStock.symbol}</h2>
          <div className="price-info">
            <span id="selected-price">₹{selectedStock.price?.toFixed(2) || '0.00'}</span>
            <span
              id="selected-change"
              className={
                "change " + (selectedStock.change >= 0 ? "up" : "down")
              }
            >
              {selectedStock.change >= 0 ? "▲" : "▼"}{" "}
              {selectedStock.change >= 0 ? "+" : ""}
              {selectedStock.change?.toFixed(2) || '0.00'}%
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
            {isRunning ? "⏸ Stop Live Trading" : "▶ Start Live Trading"}
          </button>
          <button title="Settings" className="settings-btn">
            ⚙️
          </button>
        </div>
      </section>

      {/* Enhanced Stats Cards with Real-time Updates */}
      <section className="stats-cards enhanced-stats">
        <div className="card profit-card">
          <div className="card-header">
            <span className="card-icon">💰</span>
            <span className="card-title">Total P&L</span>
          </div>
          <div className={`card-value ${monitoringData.totalPnL >= 0 ? "stat-green" : "stat-red"}`}>
            {monitoringData.totalPnL >= 0 ? '+' : ''}₹{monitoringData.totalPnL?.toFixed(2) || '0.00'}
          </div>
          <div className="card-subtitle">
            {filledOrders.length > 0 ? 
              `From ${filledOrders.length} completed trades` : 
              'No trades completed yet'
            }
          </div>
        </div>
        
        <div className="card roi-card">
          <div className="card-header">
            <span className="card-icon">📈</span>
            <span className="card-title">ROI</span>
          </div>
          <div className={`card-value ${monitoringData.roi >= 0 ? "stat-green" : "stat-red"}`}>
            {monitoringData.roi >= 0 ? '+' : ''}{monitoringData.roi?.toFixed(2) || '0.00'}%
          </div>
          <div className="card-subtitle">
            Return on Investment
          </div>
        </div>
        
        <div className="card orders-card">
          <div className="card-header">
            <span className="card-icon">📋</span>
            <span className="card-title">Orders</span>
          </div>
          <div className="card-value">
            <span className="filled-count">{monitoringData.filledOrders || 0}</span>
            <span className="orders-separator">/</span>
            <span className="pending-count">{monitoringData.pendingOrders || 0}</span>
          </div>
          <div className="card-subtitle">
            Filled / Pending
          </div>
        </div>
        
        <div className="card investment-card">
          <div className="card-header">
            <span className="card-icon">💵</span>
            <span className="card-title">Investment</span>
          </div>
          <div className="card-value">
            ₹{monitoringData.totalInvestment?.toLocaleString() || '0'}
          </div>
          <div className="card-subtitle">
            Initial Capital
          </div>
        </div>
        
        <div className="card value-card">
          <div className="card-header">
            <span className="card-icon">💎</span>
            <span className="card-title">Current Value</span>
          </div>
          <div className="card-value">
            ₹{monitoringData.currentValue?.toLocaleString() || '0'}
          </div>
          <div className="card-subtitle">
            Portfolio Value
          </div>
        </div>
        
        <div className="card performance-card">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <span className="card-title">Performance</span>
          </div>
          <div className="card-value">
            {filledOrders.length > 0 ? 
              `${((filledOrders.filter(o => o.pnl > 0).length / filledOrders.length) * 100).toFixed(0)}%` : 
              '0%'
            }
          </div>
          <div className="card-subtitle">
            Win Rate
          </div>
        </div>
      </section>

      {/* Chart Section - keeping your existing implementation */}
      <section className="chart-section">
        <div className="chart-header">
          <div>
            <h3>📊 Candlestick Chart & Grid Levels - {selectedStock.symbol.split('/')[0]}</h3>
            <p className="chart-info">
              {chartData.length > 0 && (
                <>
                  Showing {chartData.length} candles • 
                  Range: ₹{Math.min(...chartData.map(d => d.low)).toFixed(2)} - 
                  ₹{Math.max(...chartData.map(d => d.high)).toFixed(2)}
                  {gridLevels.length > 0 && (
                    <> • <span className="grid-levels-count">{gridLevels.length} Grid Levels Active</span></>
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
        
        <div className="chart-container candlestick-container">
          {loading ? (
            <div className="chart-loading">
              <div className="loading-spinner"></div>
              <p>Loading candlestick data...</p>
            </div>
          ) : chartData.length > 0 ? (
            <CandlestickChart 
              data={chartData}
              gridLevels={gridLevels}
              currentPrice={selectedStock.price}
              selectedStock={selectedStock}
            />
          ) : (
            <div className="chart-placeholder">
              <span style={{ fontSize: "3em", color: "#888" }}>🕯️</span>
              <p>No candlestick data available</p>
              <p style={{ fontSize: "0.9em", color: "#666" }}>
                Please select a stock to view OHLC candlestick data
              </p>
            </div>
          )}
        </div>
        
        {/* Enhanced Chart Legend */}
        {chartData.length > 0 && (
          <div className="chart-legend enhanced-legend">
            <div className="legend-section">
              <h4>📈 Candlestick Data</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <div className="candlestick-example bullish"></div>
                  <span>Bullish Candle (Close {">"} Open)</span>
                </div>
                <div className="legend-item">
                  <div className="candlestick-example bearish"></div>
                  <span>Bearish Candle (Close {"<"} Open)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: '#00D4AA' }}></div>
                  <span>Volume</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color current-price" style={{ backgroundColor: '#FFD700' }}></div>
                  <span>Current Price</span>
                </div>
              </div>
            </div>
            
            {gridLevels.length > 0 && (
              <div className="legend-section">
                <h4>🎯 Grid Levels ({gridLevels.length})</h4>
                <div className="grid-levels-list enhanced-grid-list">
                  {gridLevels.map((level, index) => (
                    <div key={index} className="grid-level-item enhanced-grid-item">
                      <span 
                        className="grid-level-indicator enhanced-indicator" 
                        style={{ backgroundColor: level.color }}
                      ></span>
                      <span className="grid-level-text">
                        <strong>L{index + 1}:</strong> ₹{level.value.toFixed(2)}
                        <span className={`grid-type ${level.type.toLowerCase()}`}>
                          ({level.type})
                        </span>
                      </span>
                      <span className="distance-info">
                        {((level.value - selectedStock.price) / selectedStock.price * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="legend-stats enhanced-stats">
              <div className="stat-group">
                <span className="stat-item">
                  <strong>Latest OHLC:</strong> 
                  O: ₹{chartData[chartData.length - 1]?.open?.toFixed(2) || 'N/A'} | 
                  H: ₹{chartData[chartData.length - 1]?.high?.toFixed(2) || 'N/A'} | 
                  L: ₹{chartData[chartData.length - 1]?.low?.toFixed(2) || 'N/A'} | 
                  C: ₹{chartData[chartData.length - 1]?.close?.toFixed(2) || 'N/A'}
                </span>
              </div>
              <div className="stat-group">
                <span className="stat-item">
                  Volume: {chartData.length > 0 ? 
                    (chartData[chartData.length - 1]?.volume / 1000000).toFixed(2) + 'M' : 'N/A'
                  }
                </span>
                <span className="stat-item">
                  Avg Price: ₹{chartData.length > 0 ? 
                    (chartData.reduce((sum, d) => sum + d.close, 0) / chartData.length).toFixed(2) : 'N/A'
                  }
                </span>
              </div>
              {currentStrategy && (
                <div className="stat-group strategy-info">
                  <span className="stat-item">
                    <strong>Strategy:</strong> {currentStrategy.config?.gridType || 'N/A'} Grid • 
                    Investment: ₹{currentStrategy.config?.investment?.toLocaleString() || 0}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Enhanced Orders Section with Real-time P&L */}
      <section className="orders-section enhanced-orders">
        <div className="orders-container">
          <h3>💰 Filled Orders ({filledOrders.length})</h3>
          {filledOrders.length > 0 && (
            <div className="orders-summary">
              <span className="summary-item profit">
                Total Profit: ₹{filledOrders.reduce((sum, order) => sum + (order.pnl || 0), 0).toFixed(2)}
              </span>
              <span className="summary-item trades">
                Winning Trades: {filledOrders.filter(o => o.pnl > 0).length}/{filledOrders.length}
              </span>
            </div>
          )}
          <div className="orders-table-container">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Type</th>
                  <th>Target Price</th>
                  <th>Fill Price</th>
                  <th>Qty</th>
                  <th>Grid Level</th>
                  <th>P&L</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filledOrders.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="no-orders">
                      <div className="no-orders-content">
                        <p>No filled orders yet</p>
                        <small>Orders will appear here when grid levels are hit</small>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filledOrders.map(order => (
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
                      <td className="price-cell">₹{order.price?.toFixed(2) || 'N/A'}</td>
                      <td className="price-cell">
                        <strong>₹{order.fillPrice?.toFixed(2) || 'N/A'}</strong>
                      </td>
                      <td className="qty-cell">{order.quantity?.toFixed(4) || 'N/A'}</td>
                      <td className="grid-level-cell">
                        <span className="grid-badge">Level {order.gridLevel || 'N/A'}</span>
                      </td>
                      <td className={`pnl-cell ${(order.pnl || 0) >= 0 ? 'profit' : 'loss'}`}>
                        <span className="pnl-amount">
                          {(order.pnl || 0) >= 0 ? '+' : ''}₹{(order.pnl || 0).toFixed(2)}
                        </span>
                        {order.pnl !== 0 && (
                          <span className="pnl-percentage">
                            ({(((order.pnl || 0) / (order.fillPrice * order.quantity)) * 100).toFixed(2)}%)
                          </span>
                        )}
                      </td>
                      <td className="time-cell">
                        {order.fillTime ? 
                          new Date(order.fillTime).toLocaleTimeString() : 
                          new Date(order.timestamp).toLocaleTimeString()
                        }
                      </td>
                      <td>
                        <span className="status-badge filled">FILLED</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="orders-container">
          <h3>⏳ Pending Orders ({pendingOrders.length})</h3>
          {pendingOrders.length > 0 && (
            <div className="orders-summary">
              <span className="summary-item pending">
                Total Value: ₹{pendingOrders.reduce((sum, order) => sum + (order.price * order.quantity), 0).toFixed(2)}
              </span>
              <span className="summary-item types">
                BUY: {pendingOrders.filter(o => o.type === 'BUY').length} | 
                SELL: {pendingOrders.filter(o => o.type === 'SELL').length}
              </span>
            </div>
          )}
          <div className="orders-table-container">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Grid Level</th>
                  <th>Status</th>
                  <th>Distance</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="no-orders">
                      <div className="no-orders-content">
                        <p>No pending orders</p>
                        <small>Create a strategy to generate grid orders</small>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingOrders.map(order => {
                    const distance = selectedStock.price > 0 
                      ? ((order.price - selectedStock.price) / selectedStock.price * 100)
                      : 0;
                    
                    return (
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
                        <td className="price-cell">₹{order.price?.toFixed(2) || 'N/A'}</td>
                        <td className="qty-cell">{order.quantity?.toFixed(4) || 'N/A'}</td>
                        <td className="grid-level-cell">
                          <span className="grid-badge">Level {order.gridLevel || 'N/A'}</span>
                        </td>
                        <td>
                          <span className="status-badge pending">{order.status}</span>
                        </td>
                        <td className={`distance-cell ${distance >= 0 ? 'above' : 'below'}`}>
                          {distance >= 0 ? '+' : ''}{distance.toFixed(2)}%
                        </td>
                        <td className="time-cell">
                          {new Date(order.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Enhanced Live Trading Status */}
      {liveTrading && isRunning && (
        <section className="live-status enhanced-live-status">
          <div className="live-indicator">
            <span className="live-dot pulsing"></span>
            <div className="live-content">
              <span className="live-title">🚀 Live Trading Active</span>
              <div className="live-details">
                <span>Monitoring: {selectedStock.symbol} • Price: ₹{selectedStock.price?.toFixed(2)}</span>
                <span>Email: kukrejaaryansh297@gmail.com • Notifications: ON</span>
                <span>Strategy: {currentStrategy?.strategyId || 'N/A'}</span>
                <span>Runtime: {currentStrategy?.monitoring?.startTime ? 
                  Math.floor((new Date() - new Date(currentStrategy.monitoring.startTime)) / 60000) + ' minutes' : 
                  'N/A'
                }</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Strategy Recovery Notification */}
      {currentStrategy && !liveTrading && (
        <section className="strategy-recovery-notice">
          <div className="recovery-indicator">
            <span className="recovery-icon">🔄</span>
            <div className="recovery-content">
              <span className="recovery-title">Strategy Ready for Recovery</span>
              <p>Strategy {currentStrategy.strategyId} is saved and can be resumed anytime.</p>
              <small>Your orders and progress are preserved in the database.</small>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// Enhanced Main Grid Component
function Grid() {
  const [selectedPair, setSelectedPair] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [stockPairs, setStockPairs] = useState([]);
  const [socket, setSocket] = useState(null);
  const [currentStrategy, setCurrentStrategy] = useState(null);
  const [filledOrders, setFilledOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [liveTrading, setLiveTrading] = useState(false);
  const [monitoringData, setMonitoringData] = useState({
    totalPnL: 0,
    roi: 0,
    filledOrders: 0,
    pendingOrders: 0,
    totalInvestment: 0,
    currentValue: 0
  });

  // Helper to sanitize change percent
  const sanitizeChangePercent = (ltp, close, rawChangePercent) => {
    if (!ltp || !close || close === 0) return 0;
    const calculated = ((ltp - close) / close) * 100;
    if (Math.abs(rawChangePercent) > 100) return calculated;
    return rawChangePercent;
  };

  // Load active strategies on component mount
  useEffect(() => {
    const loadActiveStrategies = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/grid-strategies/active');
        const data = await response.json();
        
        if (data.success && data.strategies.length > 0) {
          const strategy = data.strategies[0];
          setCurrentStrategy(strategy);
          setIsRunning(strategy.status === 'ACTIVE');
          setLiveTrading(strategy.status === 'ACTIVE');
          
          if (strategy.orders) {
            setFilledOrders(strategy.orders.filled || []);
            setPendingOrders(strategy.orders.pending || []);
          }
          
          if (strategy.monitoring) {
            setMonitoringData(prev => ({
              ...prev,
              ...strategy.monitoring
            }));
          }
          
          console.log('✅ Loaded active strategy:', strategy.strategyId);
        }
      } catch (error) {
        console.error('Error loading active strategies:', error);
      }
    };

    loadActiveStrategies();
  }, []);

  // Enhanced periodic order refresh with real-time monitoring data
  useEffect(() => {
    if (!currentStrategy || !isRunning) return;
    
    const refreshOrders = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/grid-strategy/${currentStrategy.strategyId}/orders`);
        const data = await response.json();
        
        if (data.success) {
          setFilledOrders(data.orders.filled);
          setPendingOrders(data.orders.pending);
          
          // Calculate real-time monitoring data
          const totalPnL = data.orders.filled.reduce((sum, order) => sum + (order.pnl || 0), 0);
          const totalInvestment = currentStrategy.config?.investment || 0;
          const currentValue = totalInvestment + totalPnL;
          const roi = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
          
          setMonitoringData(prev => ({
            ...prev,
            totalPnL: parseFloat(totalPnL.toFixed(2)),
            roi: parseFloat(roi.toFixed(2)),
            filledOrders: data.orders.filled.length,
            pendingOrders: data.orders.pending.length,
            totalInvestment,
            currentValue: parseFloat(currentValue.toFixed(2))
          }));
        }
      } catch (error) {
        console.error('Error refreshing orders:', error);
      }
    };

    const interval = setInterval(refreshOrders, 5000); // Refresh every 5 seconds for real-time updates
    return () => clearInterval(interval);
  }, [currentStrategy, isRunning]);

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/symbols');
        const data = await response.json();

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
      } catch (error) {
        console.error('Error fetching symbols:', error);
      }
    };

    fetchSymbols();

    // Enhanced WebSocket connection
    const ws = new WebSocket('ws://localhost:3001');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setSocket(ws);
      
      if (currentStrategy) {
        ws.send(JSON.stringify({
          type: 'subscribe-strategy',
          strategyId: currentStrategy.strategyId
        }));
      }
    };

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      // Handle live data updates
      if (update.type === 'live_data' && update.data) {
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
      
      // Handle strategy updates with enhanced real-time monitoring
      if (update.type === 'strategy-update') {
        if (update.data.type === 'order_filled') {
          const filledOrder = update.data.order;
          setFilledOrders(prev => {
            const newFilled = [...prev, filledOrder];
            // Recalculate monitoring data immediately
            const totalPnL = newFilled.reduce((sum, order) => sum + (order.pnl || 0), 0);
            const totalInvestment = currentStrategy?.config?.investment || 0;
            const currentValue = totalInvestment + totalPnL;
            const roi = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
            
            setMonitoringData(prev => ({
              ...prev,
              totalPnL: parseFloat(totalPnL.toFixed(2)),
              roi: parseFloat(roi.toFixed(2)),
              filledOrders: newFilled.length,
              currentValue: parseFloat(currentValue.toFixed(2))
            }));
            
            return newFilled;
          });
          
          setPendingOrders(prev => prev.filter(o => o.orderId !== filledOrder.orderId));
          
          console.log('📈 Order filled via WebSocket:', filledOrder);
          
          // Show notification
          if (Notification.permission === 'granted') {
            new Notification('Grid Trading Order Filled!', {
              body: `${filledOrder.type} order filled at ₹${filledOrder.fillPrice} with P&L: ₹${filledOrder.pnl?.toFixed(2)}`,
              icon: '/favicon.ico'
            });
          }
        } else if (update.data.type === 'monitoring_update') {
          setMonitoringData(prev => ({
            ...prev,
            ...update.data.monitoring
          }));
        } else if (update.data.type === 'order_created') {
          const newOrder = update.data.order;
          setPendingOrders(prev => [...prev, newOrder]);
          setMonitoringData(prev => ({
            ...prev,
            pendingOrders: prev.pendingOrders + 1
          }));
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (ws) {
        ws.close();
        console.log('WebSocket disconnected');
      }
    };
  }, [selectedPair, currentStrategy]);

  // Request notification permission
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const selectedStock = stockPairs.find(s => s.symbol === selectedPair) || 
    (stockPairs.length > 0 ? stockPairs[0] : { symbol: "", price: 0, change: 0, volume: 0 });

  const toggleTheme = () => setDarkMode(d => !d);
  
  const toggleStrategy = async () => {
    if (!currentStrategy) {
      alert('Please create a strategy first');
      return;
    }

    try {
      if (!isRunning) {
        const response = await fetch('http://localhost:3001/api/grid-strategy/start-live', {
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
          console.log('🚀 Live trading started successfully');
          
          if (socket) {
            socket.send(JSON.stringify({
              type: 'subscribe-strategy',
              strategyId: currentStrategy.strategyId
            }));
          }
        } else {
          throw new Error(result.message || 'Failed to start live trading');
        }
      } else {
        const response = await fetch('http://localhost:3001/api/grid-strategy/stop-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId: currentStrategy.strategyId })
        });

        const result = await response.json();
        
        if (result.success) {
          setLiveTrading(false);
          setIsRunning(false);
          setCurrentStrategy(prev => ({ ...prev, status: 'STOPPED' }));
          console.log('🛑 Live trading stopped successfully');
        }
      }
    } catch (error) {
      console.error('Error toggling strategy:', error);
      alert('Failed to toggle strategy: ' + error.message);
      setLiveTrading(false);
      setIsRunning(false);
    }
  };

  const handleStrategyUpdate = (strategy) => {
    setCurrentStrategy(strategy);
    console.log('Strategy updated in Grid:', strategy);
  };

  const handleOrdersUpdate = (orders) => {
    const filled = orders.filter(order => order.status === 'FILLED');
    const pending = orders.filter(order => order.status === 'PENDING');
    
    setFilledOrders(filled);
    setPendingOrders(pending);
    
    console.log('Orders updated in Grid:', { filled: filled.length, pending: pending.length });
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
          filledOrders={filledOrders}
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

export default Grid;
