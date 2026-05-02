# Velocity Speed Test

A streamlined, modern network speed testing application built with React, Express, and Vite.

## Features
- **Real-time Metrics**: Accurate simulation of Ping, Download, and Upload speeds.
- **Modern UI**: Dark theme inspired by Speedtest.net with smooth Framer Motion animations.
- **Sleek Gauges**: Circular SVG gauges that react dynamically to speed changes.
- **Full-Stack**: Node.js backend handles actual data streaming for metrics.

## Tech Stack
- **Frontend**: React 19, Tailwind CSS 4, Motion (formerly Framer Motion), Lucide Icons.
- **Backend**: Node.js with Express and Vite Middleware.
- **Build Tool**: Vite 6.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the development server (Express + Vite):
```bash
npm run dev
```
Access the app at `http://localhost:3000`.

### Production Build
1. Build the frontend:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```

## API Endpoints
- `GET /api/ping`: Latency check.
- `GET /api/download`: Data stream for download testing.
- `POST /api/upload`: Endpoint for upload testing.

## License
MIT
