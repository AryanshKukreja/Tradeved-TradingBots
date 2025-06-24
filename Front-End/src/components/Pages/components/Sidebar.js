import React from 'react';

function Sidebar({ stockPairs, selectedPair, selectStock, search, setSearch }) {
  const filteredStocks = stockPairs.filter(stock =>
    stock.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="sidebar">
      <input
        type="text"
        placeholder="Search NIFTY 50 stocks..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-input"
      />

      <h3>NIFTY 50 Live Prices</h3>

      <div className="stock-list">
        {filteredStocks.map((stock) => (
          <div
            key={stock.symbol}
            className={`stock-item ${selectedPair === stock.symbol ? 'selected' : ''}`}
            onClick={() => selectStock(stock.symbol)}
          >
            <div className="stock-info">
              <div className="stock-symbol">
                {stock.symbol.split('/')[0]}
              </div>
            </div>

            <div className="price-info">
              <div className="stock-price">
                ₹{stock.price.toFixed(2)}
              </div>
              <div className={`change-percent ${stock.change >= 0 ? 'up' : 'down'}`}>
                {stock.change >= 0 ? '▲' : '▼'}
                {Math.abs(stock.change).toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;