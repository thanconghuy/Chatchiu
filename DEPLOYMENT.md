# 🚀 Deployment Guide - MMOCashback

## 📋 Tổng quan

Hướng dẫn deploy full-stack application lên production server.

**Stack**: Node.js + Express + PostgreSQL + Nginx (reverse proxy)

---

## 🎯 Deployment Options

### Option 1: VPS/Cloud Server (Recommended)
- DigitalOcean, Linode, AWS EC2, Google Cloud
- Full control, scalable
- Cost: $5-20/month

### Option 2: PaaS Platform
- Heroku, Render, Railway
- Easy setup, less control
- Cost: $0-15/month (free tier available)

### Option 3: Shared Hosting
- cPanel with Node.js support
- Limited control
- Cost: $3-10/month

**Hướng dẫn này tập trung vào Option 1 (VPS)**

---

## 📦 Prerequisites

### Server Requirements
- **OS**: Ubuntu 22.04 LTS (recommended)
- **RAM**: Minimum 1GB, recommended 2GB
- **Storage**: Minimum 20GB SSD
- **CPU**: 1 vCPU minimum

### Domain Name
- Register domain (Namecheap, GoDaddy, etc.)
- Point A record to server IP
- Example: `cashback.yourdomain.com`

### Software Needed
- Node.js 18+ (LTS)
- PostgreSQL 14+
- Nginx
- PM2 (process manager)
- Git

---

## 🔧 Part 1: Server Setup

### 1.1 Initial Server Setup

```bash
# Connect to server via SSH
ssh root@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Create non-root user
sudo adduser deploy
sudo usermod -aG sudo deploy

# Switch to deploy user
su - deploy
```

### 1.2 Install Node.js

```bash
# Install Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

### 1.3 Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo -u postgres psql --version
```

### 1.4 Configure PostgreSQL

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database and user
psql

# In PostgreSQL prompt:
CREATE DATABASE cashback_db;
CREATE USER cashback_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE cashback_db TO cashback_user;
\q

# Exit postgres user
exit
```

### 1.5 Configure PostgreSQL for Remote Access (Optional)

```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/14/main/postgresql.conf

# Find and change:
listen_addresses = 'localhost'  # Keep localhost for security

# Edit pg_hba.conf for authentication
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Add line (local connections only):
local   cashback_db   cashback_user   md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 1.6 Install Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx

# Test: Open browser, go to http://your-server-ip
# Should see "Welcome to nginx" page
```

### 1.7 Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
```

---

## 📂 Part 2: Deploy Application

### 2.1 Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository
git clone https://github.com/yourusername/MMOCashback.git
cd MMOCashback

# If private repo, you'll need SSH key or personal access token
```

### 2.2 Setup Environment Variables

```bash
# Create .env file in backend directory
cd backend
nano .env
```

**Backend .env content**:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cashback_db
DB_USER=cashback_user
DB_PASSWORD=your_secure_password_here

# JWT Secret (generate random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string

# Server
PORT=3000
NODE_ENV=production

# AccessTrade API
ACCESSTRADE_API_KEY=your_accesstrade_api_key
ACCESSTRADE_API_URL=https://api.accesstrade.vn/v1

# Deep Link
DEEP_LINK_BASE=https://go.isclix.com/deep_link

# CORS (your frontend domain)
FRONTEND_URL=https://cashback.yourdomain.com

# Admin Email (for notifications)
ADMIN_EMAIL=admin@yourdomain.com
```

**Generate JWT Secret**:
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy output and use as JWT_SECRET
```

### 2.3 Install Dependencies

```bash
# Install backend dependencies
cd ~/MMOCashback/backend
npm install --production

# Verify no errors
```

### 2.4 Initialize Database

```bash
# Run database initialization
cd ~/MMOCashback/backend
node init-db.js

# Run migrations
psql -U cashback_user -d cashback_db -f ~/MMOCashback/fix-clicks-aff-sid.sql
psql -U cashback_user -d cashback_db -f ~/MMOCashback/update-lazada-ids.sql

# Verify tables created
psql -U cashback_user -d cashback_db -c "\dt"
```

### 2.5 Test Backend Locally

```bash
# Start backend temporarily
cd ~/MMOCashback/backend
npm start

# In another terminal, test API:
curl http://localhost:3000/health

# Should return: {"status":"ok"}

# Stop the test server (Ctrl+C)
```

### 2.6 Setup PM2 Process Manager

```bash
cd ~/MMOCashback/backend

# Start backend with PM2
pm2 start server.js --name cashback-api

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Copy and run the command that PM2 outputs

# Check status
pm2 status
pm2 logs cashback-api
```

**PM2 Ecosystem File** (Optional, better approach):

```bash
# Create ecosystem.config.js in backend directory
nano ~/MMOCashback/backend/ecosystem.config.js
```

```js
module.exports = {
  apps: [{
    name: 'cashback-api',
    script: './server.js',
    instances: 2,  // Use 2 instances for load balancing
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    autorestart: true
  }]
};
```

```bash
# Create logs directory
mkdir -p ~/MMOCashback/backend/logs

# Start with ecosystem file
pm2 start ecosystem.config.js
pm2 save
```

---

## 🌐 Part 3: Nginx Configuration

### 3.1 Configure Nginx Reverse Proxy

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/cashback
```

**Nginx config content**:
```nginx
# Backend API
server {
    listen 80;
    server_name api.cashback.yourdomain.com;  # Change to your domain

    # Logs
    access_log /var/log/nginx/cashback-api-access.log;
    error_log /var/log/nginx/cashback-api-error.log;

    # Reverse proxy to Node.js backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Frontend (Static Files)
server {
    listen 80;
    server_name cashback.yourdomain.com;  # Change to your domain

    # Document root
    root /home/deploy/MMOCashback/frontend;
    index index.html;

    # Logs
    access_log /var/log/nginx/cashback-frontend-access.log;
    error_log /var/log/nginx/cashback-frontend-error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3.2 Enable Nginx Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/cashback /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If OK, reload Nginx
sudo systemctl reload nginx
```

### 3.3 Update Frontend Config

```bash
# Edit frontend config to point to production API
nano ~/MMOCashback/frontend/js/config.js
```

```js
// Production API URL
const API_BASE_URL = 'https://api.cashback.yourdomain.com/api';
```

---

## 🔐 Part 4: SSL/HTTPS Setup (Let's Encrypt)

### 4.1 Install Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificates
sudo certbot --nginx -d cashback.yourdomain.com -d api.cashback.yourdomain.com

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (recommended)

# Test auto-renewal
sudo certbot renew --dry-run
```

### 4.2 Verify HTTPS

```bash
# Visit your site
https://cashback.yourdomain.com
https://api.cashback.yourdomain.com/health

# Should show green padlock (secure connection)
```

---

## 🔥 Part 5: Firewall Setup

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH (IMPORTANT - don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status

# Should show:
# 22/tcp   ALLOW   Anywhere
# 80/tcp   ALLOW   Anywhere
# 443/tcp  ALLOW   Anywhere
```

---

## 📊 Part 6: Monitoring & Maintenance

### 6.1 PM2 Monitoring

```bash
# Check app status
pm2 status

# View logs
pm2 logs cashback-api

# Monitor resources
pm2 monit

# Restart app
pm2 restart cashback-api

# Stop app
pm2 stop cashback-api

# Delete app
pm2 delete cashback-api
```

### 6.2 Database Backups

```bash
# Create backup script
nano ~/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
DB_NAME="cashback_db"
DB_USER="cashback_user"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U $DB_USER $DB_NAME > $BACKUP_DIR/cashback_${TIMESTAMP}.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "cashback_*.sql" -mtime +7 -delete

echo "Backup completed: cashback_${TIMESTAMP}.sql"
```

```bash
# Make executable
chmod +x ~/backup-db.sh

# Test backup
./backup-db.sh

# Setup cron job for daily backups (3 AM)
crontab -e

# Add line:
0 3 * * * /home/deploy/backup-db.sh
```

### 6.3 Log Rotation

Nginx logs are auto-rotated. For app logs:

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/cashback
```

```
/home/deploy/MMOCashback/backend/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## 🔄 Part 7: Continuous Deployment

### 7.1 Update Script

```bash
# Create update script
nano ~/update-app.sh
```

```bash
#!/bin/bash
APP_DIR="/home/deploy/MMOCashback"

echo "🔄 Updating application..."

# Navigate to app directory
cd $APP_DIR

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
cd backend
npm install --production

# Run migrations (if any)
echo "🗄️  Running migrations..."
# Add migration commands here if needed

# Restart PM2 app
echo "🔃 Restarting application..."
pm2 restart cashback-api

# Check status
echo "✅ Deployment complete!"
pm2 status

# Show recent logs
pm2 logs cashback-api --lines 20
```

```bash
# Make executable
chmod +x ~/update-app.sh

# Use it:
./update-app.sh
```

### 7.2 GitHub Webhooks (Advanced)

Setup webhook endpoint to auto-deploy on push:

```bash
# Install webhook listener
npm install -g webhook

# Create webhook config
# ... (advanced topic, optional)
```

---

## 🧪 Part 8: Testing Deployment

### 8.1 Health Checks

```bash
# API health check
curl https://api.cashback.yourdomain.com/health

# Should return: {"status":"ok"}

# Test login
curl -X POST https://api.cashback.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 8.2 Frontend Checks

- Visit `https://cashback.yourdomain.com`
- Test user registration
- Test merchant clicking
- Test link generation
- Check browser console for errors

---

## 🐛 Troubleshooting

### Issue: Cannot connect to database

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check database exists
sudo -u postgres psql -l | grep cashback_db

# Test connection
psql -U cashback_user -d cashback_db -c "SELECT 1;"
```

### Issue: PM2 app not starting

```bash
# Check logs
pm2 logs cashback-api --err

# Check environment variables
pm2 env 0

# Restart app
pm2 restart cashback-api
```

### Issue: Nginx 502 Bad Gateway

```bash
# Check backend is running
pm2 status

# Check Nginx error logs
sudo tail -f /var/log/nginx/cashback-api-error.log

# Check backend is listening on port 3000
sudo netstat -tlnp | grep 3000
```

### Issue: SSL certificate errors

```bash
# Renew certificates
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

---

## 📋 Post-Deployment Checklist

- [ ] Backend API accessible via HTTPS
- [ ] Frontend accessible via HTTPS
- [ ] Database initialized with tables
- [ ] PM2 running and auto-starts on boot
- [ ] Firewall configured (SSH, HTTP, HTTPS only)
- [ ] SSL certificates installed and auto-renew
- [ ] Database backups scheduled
- [ ] Log rotation configured
- [ ] Admin user created
- [ ] Test user registration works
- [ ] Test link generation works
- [ ] Test conversion tracking works
- [ ] Monitor logs for errors (24-48 hours)

---

## 🔗 Quick Links

- **Frontend**: https://cashback.yourdomain.com
- **API**: https://api.cashback.yourdomain.com
- **Admin**: https://cashback.yourdomain.com/admin

---

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs cashback-api`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/cashback-*-error.log`
3. Check database connectivity
4. Review environment variables in `.env`

---

**Last Updated**: 2025-01-16
**Deployment Time**: ~30-45 minutes
