# Let's Encrypt Integration Plan for Wormhole-RTC Messenger

This document describes how to enable free, automatic HTTPS certificates for your Node.js/Express server using Let's Encrypt.

---

## 1. Choose a Let's Encrypt Integration Method

- **Recommended:** Use the popular Greenlock or Certbot with a reverse proxy (like Nginx or Caddy).
- **Direct Node.js:** Use the `greenlock-express` package for automatic certificate management in your Node.js app.

---

## 2. Prepare Your Environment

- Make sure your server is accessible on ports 80 (HTTP) and 443 (HTTPS) from the public internet.
- You must have a real domain name (not just an IP address).

---

## 3. Using greenlock-express (Node.js-only, no proxy)

### a. Install the package:

```bash
npm install --save greenlock-express
```

### b. Update your server code:

- Replace your current `http.createServer` or Express listen logic with Greenlock’s HTTPS wrapper.
- Example:
  ```js
  const app = require('express')();
  const Greenlock = require('greenlock-express');

  Greenlock.init({
    packageRoot: __dirname,
    configDir: './greenlock.d',
    maintainerEmail: 'your@email.com',
    cluster: false
  }).serve(app);
  ```
- Set your domain and email in the config.

### c. First run:

- Greenlock will automatically request and renew certificates.

---

## 4. (Alternative) Use Nginx or Caddy as a Reverse Proxy

- Run your Node.js app on localhost (e.g., port 3000).
- Use Nginx or Caddy to handle HTTPS and proxy requests to your app.
- Use Certbot (for Nginx) or Caddy’s built-in Let’s Encrypt support.

---

## 5. Test and Monitor

- Visit your site via HTTPS and check for a valid certificate.
- Ensure auto-renewal is working (Greenlock and Caddy handle this automatically; Certbot needs a cron job).

---

## 6. Security and Best Practices

- Redirect all HTTP traffic to HTTPS.
- Store certificates securely.
- Monitor certificate expiry (Let’s Encrypt certs are valid for 90 days).

---

**Summary:**
For a pure Node.js solution, use `greenlock-express`. For production, a reverse proxy (Nginx or Caddy) is more robust and flexible. Both approaches provide free, automatic HTTPS with Let’s Encrypt.
