<<<<<<< HEAD
# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
=======
# Angel One Trading Bots

A comprehensive automated trading system built with Node.js that integrates with Angel One's Smart API to execute Grid Trading and Dollar Cost Averaging (DCA) strategies.

## 🚀 Overview

This project consists of **two main trading bots**:

1. **GRID Trading Bot** - Implements grid trading strategy with automated buy/sell orders at predetermined price levels
2. **DCA Trading Bot** - Executes Dollar Cost Averaging strategy for systematic investment

The system is built using a microservices architecture with three main backend services and a React frontend for monitoring and control.

## 🏗️ Architecture

### Backend Services

The backend consists of three independent services:

- **Data Service** (Port 3000) - Centralized API management and data provider
- **Grid Trading Service** (Port 3001) - Grid trading strategy execution
- **DCA Trading Service** (Port 3002) - Dollar cost averaging strategy execution

### Frontend

- **React Dashboard** - Real-time monitoring and bot management interface

---

## 🔧 Backend Setup

### Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- MongoDB Atlas account
- Angel One Smart API credentials

### Project Structure

```
backend/
├── data-service/          # API connection and data management
├── grid-server/           # Grid trading bot logic
├── dca-server/           # DCA trading bot logic
├── shared/               # Shared utilities and configurations
├── logs/                 # Application logs
├── node_modules/         # Dependencies
├── .env                  # Environment configuration
├── package.json          # Project dependencies and scripts
├── package-lock.json     # Dependency lock file
└── server.js            # Legacy server file (can be ignored)
```

### 1. Data Service

The **data-service** folder contains the core API integration with Angel One's Smart API:

- **API Connection Management**: Handles authentication and connection to Angel One Smart API
- **Credentials Management**: Securely manages your Angel One Smart API credentials
- **Data Provider**: Serves market data to both trading bots
- **Health Monitoring**: Provides health check endpoints for service monitoring

### 2. Grid Server

The **grid-server** implements the Grid Trading strategy:

- Automated buy/sell orders at predetermined price levels
- Dynamic grid adjustment based on market conditions
- Risk management and position tracking

### 3. DCA Server

The **dca-server** implements Dollar Cost Averaging:

- Systematic investment at regular intervals
- Portfolio rebalancing capabilities
- Long-term investment strategy execution

### Environment Configuration

Create a `.env` file in the backend root directory with the following configuration:

```env
# =============================================================================
# ANGEL ONE SMART API CONFIGURATION
# =============================================================================
ANGEL_CLIENT_CODE=your_client_code
ANGEL_API_KEY=your_api_key
ANGEL_SECRET_KEY=your_secret_key
ANGEL_MPIN=your_mpin
ANGEL_TOTP_SECRET=your_totp_secret

# =============================================================================
# SERVICE PORTS CONFIGURATION
# =============================================================================
DATA_SERVICE_PORT=3000
GRID_TRADING_PORT=3001
DCA_TRADING_PORT=3002

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
MONGODB_URI=your_mongodb_connection_string

# =============================================================================
# SERVICE URLS CONFIGURATION
# =============================================================================
DATA_SERVICE_URL=http://localhost:3000
GRID_SERVICE_URL=http://localhost:3001
DCA_SERVICE_URL=http://localhost:3002

# =============================================================================
# EMAIL CONFIGURATION
# =============================================================================
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_SERVICE=gmail

# =============================================================================
# ENVIRONMENT SETTINGS
# =============================================================================
NODE_ENV=development
LOG_LEVEL=info
```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/angel-one-trading-bots.git
   cd angel-one-trading-bots/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

### Running the Services

#### Development Mode

**Start all services simultaneously:**
```bash
npm run dev:all
```

**Start individual services:**
```bash
# Data service (must start first)
npm run dev:data

# Grid trading service
npm run dev:grid

# DCA trading service
npm run dev:dca
```

#### Production Mode

**Start all services:**
```bash
npm run start:all
```

**Using PM2 for production deployment:**
```bash
npm run pm2:start
```

### Key Features

#### 📊 Data Service Features
- Real-time market data streaming
- Historical data retrieval
- Angel One Smart API integration
- WebSocket connections for live updates
- Authentication and session management

#### 🔄 Email Notification System
- **Order Execution Alerts**: Automatic email notifications when trades are executed
- **System Status Updates**: Notifications for bot start/stop events
- **Error Notifications**: Alert emails for system errors or failures
- **Strategy Management**: Emails when strategies are started/stopped
- **User-specific Notifications**: Configurable per-user email preferences

#### 🎯 Trading Strategy Features

**Grid Trading:**
- Multi-level grid order placement
- Automatic buy/sell execution at predetermined price levels
- Real-time order monitoring and fills detection
- Profit and loss tracking per strategy
- Backtest functionality with historical data
- Single active strategy enforcement (stops previous when starting new)

**DCA Trading:**
- Scheduled investment execution using cron jobs
- Flexible frequency configuration (daily, weekly, monthly)
- Portfolio accumulation tracking
- Automatic order scheduling and execution
- Backtest functionality for strategy validation
- Single active strategy enforcement

#### 🛡️ Security Features
- Secure credential management
- API rate limiting
- Error handling and logging
- Health monitoring endpoints

### API Endpoints

#### Data Service (Port 3000)
- `GET /health` - Health check
- `GET /api/live/:symbol` - Current live price data for a symbol
- `GET /api/market-data` - Current market data
- `GET /api/historical-data` - Historical price data
- `POST /api/authenticate` - Angel One API authentication

#### Grid Trading Service (Port 3001)
- `GET /health` - Health check
- `POST /api/grid-strategy/create` - Create new grid strategy
- `POST /api/grid-strategy/start-live` - Start grid live trading
- `POST /api/grid-strategy/stop-live` - Stop grid live trading
- `POST /api/grid-strategy/backtest` - Run grid strategy backtest
- `GET /api/grid-strategy/:strategyId/orders` - Get grid strategy orders
- `GET /api/grid-strategies/active` - Get all active grid strategies
- `GET /api/grid-strategy/:strategyId` - Get grid strategy details
- `POST /api/grid-strategy/:strategyId/check-orders` - Force check orders (debugging)

#### DCA Trading Service (Port 3002)
- `GET /health` - Health check
- `POST /api/dca-strategy/create` - Create new DCA strategy
- `POST /api/dca-strategy/start-live` - Start DCA live trading
- `POST /api/dca-strategy/stop-live` - Stop DCA live trading
- `POST /api/dca-strategy/backtest` - Run DCA strategy backtest
- `GET /api/dca-strategy/:strategyId/orders` - Get DCA strategy orders
- `GET /api/dca-strategies/active` - Get all active DCA strategies

### Key API Usage Examples

#### Starting Grid Trading
```bash
POST /api/grid-strategy/start-live
Content-Type: application/json

{
  "strategy": {
    "id": "grid_strategy_123",
    "stockSymbol": "NIFTY50",
    "config": {
      "upperPrice": 18000,
      "lowerPrice": 17000,
      "gridLevels": 10,
      "investment": 50000
    }
  },
  "userEmail": "trader@example.com",
  "emailNotifications": true
}
```

#### Starting DCA Trading
```bash
POST /api/dca-strategy/start-live
Content-Type: application/json

{
  "strategy": {
    "id": "dca_strategy_123",
    "stockSymbol": "NIFTY50",
    "config": {
      "investmentAmount": 5000,
      "frequency": "weekly",
      "duration": "1year"
    }
  },
  "userEmail": "trader@example.com",
  "emailNotifications": true
}
```

#### Running Backtests
```bash
POST /api/grid-strategy/backtest
Content-Type: application/json

{
  "symbol": "NIFTY50",
  "config": {
    "upperPrice": 18000,
    "lowerPrice": 17000,
    "gridLevels": 10,
    "investment": 50000
  },
  "historicalData": [...],
  "period": "1month"
}
```

### Health Monitoring

Check the health of all services:
```bash
npm run health:check
```

- Application logs are stored in the `logs/` directory
- Different log levels: info, warn, error, debug
- Separate log files for each service

**View logs:**
```bash
# All services
npm run logs:all

# Individual services
npm run logs:data
npm run logs:grid
npm run logs:dca
```

### Troubleshooting

1. **Service startup issues**: Ensure the data service starts first before other services
2. **API authentication errors**: Verify your Angel One Smart API credentials
3. **Database connection issues**: Check MongoDB URI and network connectivity
4. **Email notifications not working**: Verify email credentials and app password

### Dependencies

**Production Dependencies:**
- `express` - Web framework
- `axios` - HTTP client
- `mongoose` - MongoDB ODM
- `smartapi-javascript` - Angel One Smart API SDK
- `socket.io` - Real-time communication
- `nodemailer` - Email notifications
- `node-cron` - Task scheduling
- `otplib` - TOTP generation

**Development Dependencies:**
- `nodemon` - Development server
- `concurrently` - Run multiple services
- `pm2` - Production process manager
- `wait-on` - Service dependency management

---

## 🎨 Frontend Setup

The frontend is a React-based dashboard that provides real-time monitoring and control of your trading bots.

### Frontend Structure

```
front_end/
├── node_modules/         # Dependencies
├── public/              # Static assets
├── src/                 # Source code
│   ├── components/      # React components
│   │   ├── Pages/       # Main page components
│   │   │   └── components/  # Page-specific components
│   │   │       ├── ConfigSidebar.js    # Trading parameters configuration
│   │   │       ├── ConfigSidebar2.js   # Alternative config sidebar
│   │   │       └── Sidebar.js          # Stock details sidebar
│   │   ├── DCA.css             # DCA component styles
│   │   ├── DCA.js              # DCA trading interface
│   │   ├── GRID.css            # Grid component styles
│   │   ├── GRID.js             # Grid trading interface
│   │   ├── Navbar.css          # Navigation styles
│   │   ├── Navbar.js           # Navigation component
│   │   ├── App.css             # Main application styles
│   │   ├── App.js              # Main application component
│   │   └── App.test.js         # Application tests
│   ├── index.css        # Global styles
│   ├── index.html       # HTML template
│   └── index.js         # Application entry point
├── package.json         # Frontend dependencies
└── package-lock.json    # Dependency lock file
```

### Key Frontend Components

#### 🎛️ ConfigSidebar.js
**Purpose**: Right-side configuration panel for setting trading parameters
- **Grid Configuration**: Set upper/lower price bounds, grid levels, investment amount
- **DCA Configuration**: Configure investment amount, frequency, duration
- **Real-time Parameter Updates**: Live validation and parameter adjustment
- **Strategy Creation**: Create and modify trading strategies before execution

#### 📊 Sidebar.js  
**Purpose**: Left-side panel displaying live stock information
- **NIFTY 50 Live Prices**: Real-time price updates for major stocks
- **Stock Details**: Current prices, percentage changes, market indicators
- **Multi-stock Monitoring**: Track multiple stocks simultaneously (RELIANCE, TCS, HDFCBANK, etc.)
- **Live Data Integration**: Connected to backend data service for real-time updates

#### 📈 GRID.js
**Purpose**: Main Grid Trading interface and monitoring
- **Grid Strategy Visualization**: Visual representation of grid levels and orders
- **Live Trading Controls**: Start/stop grid trading with real-time feedback
- **Order Monitoring**: Track pending, filled, and cancelled orders
- **Performance Metrics**: P&L tracking, total trades, success rates
- **Backtest Integration**: Run historical backtests before live trading

#### 💰 DCA.js  
**Purpose**: Dollar Cost Averaging interface and control panel
- **DCA Price Charts**: Historical price visualization with volume data
- **Strategy Management**: Configure and monitor DCA strategies
- **Investment Tracking**: Total investment, current value, order history
- **Automated Execution Status**: Real-time status of scheduled DCA orders
- **Email Notifications**: Configure and monitor notification settings

#### 🧭 Navbar.js
**Purpose**: Top navigation and mode switching
- **Strategy Switching**: Toggle between "Spot Grid", "DCA Bot", and "Price Level Alert"
- **TRADEVED Branding**: Application branding and navigation
- **User Controls**: Access to user settings and account information

### Frontend Features

#### 🔴 Real-time Dashboard
- **Live Price Updates**: WebSocket connection for real-time market data
- **Strategy Status Monitoring**: Active/inactive strategy indicators
- **Order Execution Tracking**: Real-time order status updates
- **Performance Analytics**: Live P&L calculations and performance metrics

#### 🎨 Interactive Charts
- **Price Visualization**: Candlestick charts with technical indicators
- **Volume Analysis**: Trading volume overlays and analysis
- **Grid Level Display**: Visual representation of grid trading levels
- **Historical Data**: Multiple timeframe analysis (1W, 1M, 3M)

#### ⚙️ Strategy Configuration
- **Parameter Validation**: Real-time validation of trading parameters
- **Risk Management**: Built-in risk controls and warnings
- **Strategy Templates**: Pre-configured strategy templates
- **Backtest Integration**: Test strategies before live execution

### Frontend Installation

1. **Navigate to frontend directory**
   ```bash
   cd front_end
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Create .env file in front_end directory
   REACT_APP_API_URL=http://localhost:3000
   REACT_APP_GRID_SERVICE_URL=http://localhost:3001
   REACT_APP_DCA_SERVICE_URL=http://localhost:3002
   REACT_APP_WS_URL=ws://localhost:3000
   ```

4. **Start development server**
   ```bash
   npm start
   ```

5. **Access the dashboard**
   ```
   http://localhost:3005/dca (for DCA interface)
   http://localhost:3005 (for main dashboard)
   ```

### Frontend Technologies

**Core Technologies:**
- `React 18+` - Component-based UI framework
- `JavaScript ES6+` - Modern JavaScript features
- `CSS3` - Responsive styling and animations
- `WebSocket` - Real-time data communication

**Key Features:**
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Live data streaming from backend services
- **Interactive Charts**: Advanced charting with multiple timeframes
- **Form Validation**: Real-time parameter validation and error handling
- **Notification System**: Toast notifications for user feedback

### User Interface Flow

1. **Dashboard Access**: Users access the main trading dashboard
2. **Strategy Selection**: Choose between Grid Trading or DCA strategy
3. **Parameter Configuration**: Use ConfigSidebar to set trading parameters
4. **Market Analysis**: Review live prices and charts in the main area
5. **Strategy Execution**: Start live trading with real-time monitoring
6. **Performance Tracking**: Monitor orders, P&L, and strategy performance

### Development Commands

```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

---

## 🚀 Complete System Setup

### Quick Start (All Services)

1. **Clone and setup backend**
   ```bash
   git clone https://github.com/your-username/angel-one-trading-bots.git
   cd angel-one-trading-bots/backend
   npm install
   cp .env.example .env
   # Configure your .env file
   npm run dev:all
   ```

2. **Setup frontend**
   ```bash
   cd ../front_end
   npm install
   # Configure frontend .env
   npm start
   ```

3. **Access the application**
   - Frontend Dashboard: `http://localhost:3005`
   - Data Service API: `http://localhost:3000`
   - Grid Service API: `http://localhost:3001`
   - DCA Service API: `http://localhost:3002`

### Production Deployment

```bash
# Backend services with PM2
cd backend
npm run pm2:start

# Frontend build
cd front_end
npm run build
# Deploy build folder to your web server
```

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

## ⚠️ Disclaimer

This trading bot is for educational and personal use only. Trading involves financial risk, and you should never invest more than you can afford to lose. Always test thoroughly in a paper trading environment before using real money.
>>>>>>> 105aacae497277077a09f7650278d37f217ca3fe
