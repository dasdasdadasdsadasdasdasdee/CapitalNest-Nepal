require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

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
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.listen(PORT, () => {
  console.log(`CapitalNest Nepal server running on port ${PORT}`);
});
