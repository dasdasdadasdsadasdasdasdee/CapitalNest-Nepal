require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const walletApi = require('./server/wallet-api');
const app = express();

const PORT = process.env.PORT || 3000;
const privateUploadDir = path.join(__dirname, 'private', 'uploads');
fs.mkdirSync(privateUploadDir, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(privateUploadDir));
app.use('/api', walletApi);

// Serve static files from the project root.
app.use(express.static(path.join(__dirname)));

// Open the landing page at the site root.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

// Keep login page available explicitly.
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Fallback for other frontend routes to the home page instead of the login screen.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API_NOT_FOUND' });
  }

  res.sendFile(path.join(__dirname, 'home.html'));
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    require('./server/telegram-bot');
    console.log('Telegram bot startup hook enabled.');
  } catch (error) {
    console.error('Telegram bot failed to start:', error.message);
  }
} else {
  console.warn('Telegram bot is disabled because TELEGRAM_BOT_TOKEN is not set in Railway environment variables.');
}

app.listen(PORT, () => {
  console.log(`CapitalNest Nepal server running on port ${PORT}`);
});
