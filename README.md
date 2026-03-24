# AIO Agency CRM

A modern, full-stack CRM and agency management platform built with React and FastAPI.

## 🚀 Features

- **Dashboard** - Overview of key metrics and activities
- **CRM** - Contact and company management
- **Forms** - Dynamic form builder
- **Pipeline** - Deal and opportunity tracking
- **Calendar** - Event and appointment scheduling
- **Orders** - Order management system
- **AI Agents** - Intelligent automation
- **Design** - Brand and design management
- **Integrations** - Connect with third-party services
- **Settings** - Comprehensive configuration options

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.8+
- **Git**

## 🛠️ Installation

### Frontend Setup

```bash
cd frontend
npm install
```

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

## 🔧 Configuration

### Frontend Environment

Create a `.env` file in the `frontend` directory:

```bash
# Copy from example
cp .env.example .env
```

Edit `.env` with your configuration:

```env
VITE_API_URL=http://localhost:8001
# Add other variables as needed
```

### Backend Environment

Create a `.env` file in the `backend` directory:

```bash
# Copy from example
cp .env.example .env
```

Edit `.env` with your configuration:

```env
ALLOWED_ORIGINS=http://localhost:5175,http://localhost:3000
PORT=8001
HOST=0.0.0.0
ENVIRONMENT=development
```

## 🚀 Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
python server.py
```

The backend will start on `http://localhost:8001`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5175`

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

## 📁 Project Structure

```
aio-agency/
├── frontend/
│   ├── src/
│   │   ├── api/              # API client and services
│   │   ├── components/       # Reusable components
│   │   ├── contexts/         # React contexts
│   │   ├── config/           # Configuration files
│   │   ├── data/             # Initial data and constants
│   │   ├── lib/              # Utility libraries
│   │   ├── modules/          # Feature modules
│   │   ├── pages/            # Page components
│   │   ├── services/         # Business logic services
│   │   ├── App.jsx           # Main app component
│   │   └── main.jsx          # Entry point
│   ├── public/               # Static assets
│   ├── package.json
│   └── vite.config.js
│
└── backend/
    ├── server.py             # FastAPI application
    ├── requirements.txt      # Python dependencies
    └── .env.example          # Environment template
```

## 🔑 Key Technologies

### Frontend
- **React 19** - UI library
- **Vite 7** - Build tool
- **TailwindCSS 4** - Styling
- **React Router 7** - Routing
- **Lucide React** - Icons
- **PropTypes** - Type checking

### Backend
- **FastAPI** - Web framework
- **Uvicorn** - ASGI server
- **Python-dotenv** - Environment management

## 🎨 Features

### Code Splitting
The application uses React.lazy and Suspense for automatic code splitting, reducing initial bundle size and improving load times.

### Theme Support
Built-in dark/light theme support with system preference detection.

### Accessibility
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators
- Screen reader friendly

### Error Handling
- Global error boundary
- API error handling
- Structured logging

## 🧪 API Endpoints

### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "message": "Backend is running",
  "timestamp": "2026-01-26T21:15:59.123456",
  "version": "1.0.0",
  "environment": "development"
}
```

### API Documentation
Visit `http://localhost:8001/docs` for interactive API documentation (Swagger UI).

## 🔒 Security

- CORS configured with specific allowed origins
- Environment-based configuration
- No hardcoded secrets
- Input validation on API endpoints

## 📝 Development

### Code Style
- ESLint for JavaScript linting
- PropTypes for runtime type checking
- Structured logging in backend

### Component Structure
```jsx
import PropTypes from 'prop-types';

const MyComponent = ({ prop1, prop2 }) => {
  // Component logic
  return (/* JSX */);
};

MyComponent.propTypes = {
  prop1: PropTypes.string.isRequired,
  prop2: PropTypes.func.isRequired,
};

export default MyComponent;
```

## 🐛 Troubleshooting

### Frontend won't start
- Ensure Node.js 18+ is installed
- Delete `node_modules` and run `npm install` again
- Check for port conflicts (default: 5175)

### Backend won't start
- Ensure Python 3.8+ is installed
- Install dependencies: `pip install -r requirements.txt`
- Check for port conflicts (default: 8001)

### CORS errors
- Verify `ALLOWED_ORIGINS` in backend `.env` includes your frontend URL
- Restart the backend after changing environment variables

## 📄 License

Proprietary - All rights reserved

## 👥 Contributing

This is a private project. Contact the maintainers for contribution guidelines.

## 📞 Support

For support, please contact the development team.

---

**Built with ❤️ by the AIO Agency team**
