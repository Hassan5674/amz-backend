// server.js
require('dotenv').config(); // Load environment variables from .env (or Render's dashboard)
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json()); // IMPORTANT: Required to parse JSON webhook payloads

// ==========================================
// 1. CONFIGURATION (Put your keys here OR in Render Env Vars)
// ==========================================
const PORT = process.env.PORT || 3000;
const NOW_API_KEY = process.env.NOW_API_KEY; // From NOWPayments dashboard
const NOW_IPN_SECRET = process.env.NOW_IPN_SECRET; // From NOWPayments dashboard

// Your exact webhook URL
const WEBHOOK_URL = 'https://amz-backend-6isd.onrender.com/api/webhook';

// ==========================================
// 2. CREATE PAYMENT ROUTE (For your frontend)
// ==========================================
// This route is called when a user wants to pay with any of the 300+ coins
app.post('/api/create-payment', async (req, res) => {
    const { price_amount, price_currency, pay_currency, order_id } = req.body;

    // Basic validation
    if (!price_amount || !price_currency || !pay_currency || !order_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Call NOWPayments to generate a payment address
        const response = await axios.post('https://api.nowpayments.io/v1/payment', {
            price_amount: price_amount,       // e.g., 100
            price_currency: price_currency,   // e.g., 'usd'
            pay_currency: pay_currency,       // e.g., 'btc', 'eth', 'usdt', 'sol' (ANY coin)
            order_id: order_id,               // Your unique internal order ID
            ipn_callback_url: WEBHOOK_URL     // The webhook that verifies payment
        }, {
            headers: { 'x-api-key': NOW_API_KEY }
        });

        // Send the payment address and amount back to your user
        res.json({
            pay_address: response.data.pay_address,
            pay_amount: response.data.pay_amount,
            payment_id: response.data.payment_id,
            pay_currency: response.data.pay_currency
        });

    } catch (error) {
        console.error('Error creating payment:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// ==========================================
// 3. WEBHOOK ROUTE (The "No RPC" Verification)
// ==========================================
// NOWPayments sends a POST request here when the payment is done
app.post('/api/webhook', (req, res) => {
    const signature = req.headers['x-nowpayments-sig'];
    const payload = JSON.stringify(req.body);
    
    // 1. VERIFY SIGNATURE (Security Check - stops fake payments)
    const hmac = crypto.createHmac('sha512', NOW_IPN_SECRET);
    hmac.update(payload);
    const digest = hmac.digest('hex');

    if (digest !== signature) {
        console.error('Invalid signature detected!');
        return res.status(401).send('Invalid signature');
    }

    // 2. PROCESS PAYMENT STATUS
    const { payment_status, payment_id, actually_paid, order_id } = req.body;

    if (payment_status === 'finished' || payment_status === 'confirmed') {
        console.log(`Payment confirmed! Order: ${order_id}, Payment ID: ${payment_id}, Amount: ${actually_paid}`);
        
        // ==========================================
        // TODO: PUT YOUR DATABASE LOGIC HERE
        // Example: 
        // const user = await db.findUserByOrderId(order_id);
        // await db.updateUserBalance(user.id, actually_paid);
        // ==========================================
        
        // (Optional) Send a success email or notification to the user
    } else if (payment_status === 'partially_paid') {
        console.log(`Partially paid for order: ${order_id}`);
        // Handle partial payments (if you allow them)
    } else {
        console.log(`Payment status update: ${payment_status} for order ${order_id}`);
    }

    // 3. ALWAYS SEND 200 OK
    // If you don't send this, NOWPayments will keep retrying the webhook
    res.sendStatus(200);
});

// Fallback route for checking if server is online
app.get('/', (req, res) => {
    res.send('Payment backend is running!');
});

// ==========================================
// 4. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
