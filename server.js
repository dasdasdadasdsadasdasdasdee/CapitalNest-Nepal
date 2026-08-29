require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Serve static files from the project root.
app.use(express.static(path.join(__dirname)));

// Fallback to the login page for frontend routes.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.listen(PORT, () => {
  console.log(`CapitalNest Nepal server running on port ${PORT}`);
});
