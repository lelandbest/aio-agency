# Deployment Guide

## Prerequisites
- Node.js 16+
- npm or yarn
- Environment variables configured

## Development Deployment

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Server runs at `http://localhost:5173`

## Production Build

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

Output is in `dist/` directory

## Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
VITE_API_URL=your_api_url
VITE_DEFAULT_THEME=dark
VITE_ENABLE_GOOGLE_CALENDAR=false
```

## Hosting Options

### Vercel (Recommended for Vite)
1. Push to Github
2. Connect repository to Vercel
3. Vercel auto-detects Vite
4. Deploy

### Netlify
```bash
npm run build
# Deploy dist/ folder
```

### Traditional Server
```bash
npm run build
# Copy dist/ contents to web server
```

## Performance Tips

1. Enable gzip compression
2. Set cache headers for assets
3. Use CDN for static files
4. Monitor bundle size

## Monitoring

- Monitor error logs
- Track theme toggle analytics
- Check performance metrics

---

For questions, see README.md or CONTRIBUTING.md
