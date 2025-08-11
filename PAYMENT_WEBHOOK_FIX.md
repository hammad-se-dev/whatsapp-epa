# Payment Webhook Fix Guide

## Problem

The payment status is not updating to "completed" after successful payments because Stripe webhooks are not being delivered to the local development server.

## Root Cause

Stripe webhooks require a publicly accessible URL, but `localhost:3001` is not accessible from the internet.

## Solutions

### Option 1: Use ngrok (Recommended for Development)

1. **Install ngrok** (if not already installed):

   ```bash
   npm install -g ngrok
   # or download from https://ngrok.com/
   ```

2. **Start your backend server**:

   ```bash
   npm start
   ```

3. **In a new terminal, expose your local server**:

   ```bash
   ngrok http 3001
   ```

4. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)

5. **Update Stripe webhook endpoint**:

   - Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
   - Find your webhook endpoint
   - Update the URL to: `https://abc123.ngrok.io/api/stripe/webhook`
   - Save the changes

6. **Test the webhook**:
   - Make a test payment
   - Check the ngrok dashboard for webhook delivery
   - Check your server logs for webhook processing

### Option 2: Use Stripe CLI (Alternative)

1. **Install Stripe CLI**:

   ```bash
   # Download from https://stripe.com/docs/stripe-cli
   ```

2. **Login to Stripe**:

   ```bash
   stripe login
   ```

3. **Forward webhooks to local server**:

   ```bash
   stripe listen --forward-to localhost:3001/api/stripe/webhook
   ```

4. **Copy the webhook signing secret** and add it to your `.env` file:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Option 3: Manual Webhook Testing (Current Workaround)

For immediate testing, use the manual webhook trigger endpoint:

```bash
curl -X POST http://localhost:3001/api/stripe/test-webhook/PAYMENT_INTENT_ID
```

## Verification Steps

1. **Check webhook delivery**:

   - Look for webhook events in Stripe Dashboard
   - Check ngrok dashboard (if using ngrok)
   - Monitor server logs for webhook processing

2. **Verify payment status updates**:

   ```bash
   node test-payment-status.js
   ```

3. **Test complete flow**:
   - Make a new job application
   - Complete payment
   - Verify webhook is triggered
   - Check payment status is updated

## Environment Variables

Ensure these are set in your `.env` file:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
MONGODB_URI=mongodb+srv://...
```

## Production Deployment

For production, ensure:

1. Your server has a public HTTPS URL
2. Webhook endpoint is configured in Stripe Dashboard
3. Webhook secret is properly set
4. Server can handle webhook requests

## Debugging

If webhooks still don't work:

1. **Check webhook logs in Stripe Dashboard**
2. **Verify webhook endpoint URL is correct**
3. **Ensure webhook secret matches**
4. **Check server logs for errors**
5. **Test with Stripe CLI webhook forwarding**

## Current Status

✅ **Manual webhook trigger works** - The test endpoint successfully updates payment status
❌ **Automatic webhook delivery** - Needs ngrok or Stripe CLI for local development
✅ **Payment processing works** - Payments are successful, just status updates fail
