// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NOW_API_KEY = process.env.42T21GY-P6D4QMW-NSMAV55-MDHNY0F;
const NOW_IPN_SECRET = process.env.PluBAuPAVfhGGm/PL4JdTd0cAUSAJzQd;
const WEBHOOK_URL = 'https://amz-backend-6isd.onrender.com/api/webhook';

// In-memory store to link your order_id to NOWPayments payment_id
const paymentStore = {}; 

// 1. Create Payment (Called by your frontend)
app.post('/api/create-payment', async (req, res) => {
    const { price_amount, price_currency, pay_currency, order_id } = req.body;

    try {
        const response = await axios.post('https://api.nowpayments.io/v1/payment', {
            price_amount: price_amount,
            price_currency: price_currency, // e.g., 'usd'
            pay_currency: pay_currency,     // e.g., 'btc', 'eth', 'sol', 'usdt' (300+ coins)
            order_id: order_id,
            ipn_callback_url: WEBHOOK_URL
        }, {
            headers: { 'x-api-key': NOW_API_KEY }
        });

        // Store the payment_id for later polling
        paymentStore[order_id] = response.data.payment_id;

        res.json({
            pay_address: response.data.pay_address,
            pay_amount: response.data.pay_amount,
            pay_currency: response.data.pay_currency,
            payment_id: response.data.payment_id
        });

    } catch (error) {
        console.error('Error creating payment:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// 2. Check Payment Status (Called by your frontend to poll)
app.get('/api/payment-status/:order_id', async (req, res) => {
    const order_id = req.params.order_id;
    const payment_id = paymentStore[order_id];

    if (!payment_id) {
        return res.json({ status: 'not_found' });
    }

    try {
        // Ask NOWPayments for the current status of that payment
        const response = await axios.get(`https://api.nowpayments.io/v1/payment/${payment_id}`, {
            headers: { 'x-api-key': NOW_API_KEY }
        });
        
        // Return the status (e.g., waiting, confirming, finished)
        res.json({ status: response.data.payment_status });
    } catch (error) {
        res.json({ status: 'error' });
    }
});

// 3. Webhook (Confirmed by NOWPayments)
app.post('/api/webhook', (req, res) => {
    const signature = req.headers['x-nowpayments-sig'];
    const payload = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha512', NOW_IPN_SECRET);
    hmac.update(payload);
    const digest = hmac.digest('hex');

    if (digest !== signature) {
        return res.status(401).send('Invalid signature');
    }

    if (req.body.payment_status === 'finished' || req.body.payment_status === 'confirmed') {
        console.log(`Payment confirmed for order: ${req.body.order_id}`);
        // TODO: Update your database here to credit the user!
    }

    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
