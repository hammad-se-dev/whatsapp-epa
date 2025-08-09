# 🚀 Enhanced Terminal Test Guide

## Quick Setup

1. **Start the server:**

   ```bash
   npm start
   ```

2. **Run the enhanced terminal test:**
   ```bash
   node terminal-test.js
   ```

## 🧪 Test Scenarios

### Scenario 1: Job Posting Flow (Employer)

```
👔 EMPLOYER: post job
👔 EMPLOYER: Senior React Developer
👔 EMPLOYER: We are looking for an experienced React developer to join our team. Must have 3+ years experience with React, Redux, and modern JavaScript. You'll be working on exciting projects with a collaborative team.
👔 EMPLOYER: 1
👔 EMPLOYER: $70,000 - $90,000 per year
👔 EMPLOYER: San Francisco, CA (Hybrid)
👔 EMPLOYER: 2
👔 EMPLOYER: 3-5 years experience required
👔 EMPLOYER: React, Redux, JavaScript, TypeScript, Node.js
👔 EMPLOYER: TechCorp Inc
👔 EMPLOYER: hiring@techcorp.com
👔 EMPLOYER: post

// Bot will provide payment link with payment intent ID
// Copy the payment intent ID from the link

👔 EMPLOYER: /pay pi_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Scenario 2: Job Application Flow (Employee)

```
👤 EMPLOYEE: jobs
👤 EMPLOYEE: 1
👤 EMPLOYEE: 1
👤 EMPLOYEE: apply

// Bot will provide payment link with payment intent ID
// Copy the payment intent ID from the link

👤 EMPLOYEE: /pay pi_xxxxxxxxxxxxxxxxxxxxxxxx
```

## 🔧 Special Commands

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `/help`             | Show all available commands  |
| `/user employer`    | Switch to employer test user |
| `/user employee`    | Switch to employee test user |
| `/user default`     | Switch to default test user  |
| `/pay <payment_id>` | Simulate successful payment  |
| `/jobs`             | Show recent jobs in database |
| `/applications`     | Show recent applications     |
| `/users`            | Show all test users          |

## 💡 Testing Tips

1. **Payment Flow Testing:**

   - When you see a payment link, extract the payment intent ID
   - Use `/pay <payment_intent_id>` to simulate successful payment
   - Check database updates with `/jobs` or `/applications`

2. **Multi-User Testing:**

   - Use `/user employer` to test job posting
   - Use `/user employee` to test job applications
   - Each user maintains separate conversation state

3. **Database Verification:**
   - Use `/jobs` to see created job posts
   - Use `/applications` to see submitted applications
   - Use `/users` to see user states and roles

## 🎯 Expected Outcomes

### After Job Posting Payment:

- Job record created in database with `paymentStatus: 'completed'`
- Job status set to `pending_approval`
- User state updated to `completed`

### After Application Payment:

- Application record created with `paymentStatus: 'completed'`
- Application linked to job and user
- User state updated to `completed`

## 🐛 Troubleshooting

1. **Payment simulation not working:**

   - Ensure the payment intent ID is correct
   - Check that the job/application record exists in database

2. **User state issues:**

   - Use `/users` to check current states
   - Use `/user <type>` to switch between different test users

3. **Database connection:**
   - Ensure MongoDB is running
   - Check `.env` file has correct `MONGODB_URI`

## 📊 Sample Test Flow

```bash
# Start terminal test
node terminal-test.js

# Test job posting
/user employer
post job
Senior Developer
[enter job details as prompted]
post
/pay pi_xxxxxxxxxxxxxxxxxxxxxxxx

# Check database
/jobs

# Test application
/user employee
jobs
1
1
apply
/pay pi_yyyyyyyyyyyyyyyyyyyyyyyy

# Check database
/applications

# Exit
exit
```
