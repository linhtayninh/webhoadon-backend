const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const transactionRoutes = require('./routes/transaction');
const reportRoutes = require('./routes/report');
const { router: adminRoutes } = require('./routes/admin');
const adsRoutes = require('./routes/ads');

app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ads', adsRoutes);

app.get('/', (req, res) => {
  res.send('API Thuế Hộ Kinh Doanh is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
