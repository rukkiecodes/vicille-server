import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from '../core/logger/index.js';

let transporter;

const initializeTransporter = () => {
  try {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      requireTLS: !config.email.secure,
      auth: { user: config.email.user, pass: config.email.password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    logger.info('Email transporter initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize email transporter:', error);
    throw error;
  }
};

const getTransporter = () => {
  if (!transporter) initializeTransporter();
  return transporter;
};

// ─── Shared design system ──────────────────────────────────────────────────────

const BRAND_CSS = `
  body{margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;}
  .wrap{max-width:600px;margin:0 auto;padding:24px 16px 40px;}
  .shell{background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d2d2d7;}
  .hdr{background:#1d1d1f;padding:36px 32px;text-align:center;}
  .hdr-brand{font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;}
  .hdr-title{font-size:22px;font-weight:600;color:#ffffff;margin:0;letter-spacing:-0.3px;line-height:1.2;}
  .hdr-sub{font-size:14px;color:rgba(255,255,255,0.6);margin:6px 0 0;letter-spacing:-0.1px;}
  .body{padding:32px;}
  .greeting{font-size:17px;font-weight:500;color:#1d1d1f;margin:0 0 12px;}
  p{font-size:15px;color:#1d1d1f;line-height:1.6;margin:0 0 14px;}
  .secondary{color:#6e6e73;}
  .card{background:#f5f5f7;border-radius:12px;padding:20px 22px;margin:20px 0;}
  .row{margin:0 0 10px;padding:0 0 10px;border-bottom:1px solid #e8e8ed;}
  .row:last-child{margin:0;padding:0;border:none;}
  .row-label{font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#86868b;margin-bottom:3px;}
  .row-value{font-size:15px;font-weight:500;color:#1d1d1f;word-break:break-all;}
  .code-box{background:#f5f5f7;border-radius:14px;padding:28px;text-align:center;margin:20px 0;}
  .code{font-size:40px;font-weight:700;letter-spacing:10px;color:#1d1d1f;font-family:'SF Mono','Fira Code','Courier New',monospace;display:block;}
  .code-hint{font-size:13px;color:#86868b;margin-top:8px;}
  .pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 12px;border-radius:980px;margin:12px 0 16px;}
  .pill-green{background:#e8f5e9;color:#2e7d32;}
  .pill-red{background:#fff2f2;color:#c62828;}
  .pill-blue{background:#e3f2fd;color:#0d47a1;}
  .pill-amber{background:#fff8e1;color:#8a6200;}
  .notice{border-radius:10px;padding:14px 16px;margin:16px 0;font-size:14px;line-height:1.5;}
  .notice-amber{background:#fff8e1;border-left:3px solid #f59e0b;color:#8a6200;}
  .notice-green{background:#f0faf4;border-left:3px solid #4caf50;color:#1b6b35;}
  .notice-red{background:#fff2f2;border-left:3px solid #ef5350;color:#c62828;}
  .notice strong{font-weight:600;}
  .btn{display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:980px;font-size:15px;font-weight:600;letter-spacing:-0.1px;}
  .btn-center{text-align:center;margin:24px 0;}
  .divider{border:none;border-top:1px solid #e8e8ed;margin:24px 0;}
  .footer-wrap{padding:20px 32px;border-top:1px solid #e8e8ed;text-align:center;}
  .footer-text{font-size:13px;color:#86868b;margin:4px 0;line-height:1.5;}
  .footer-brand{font-size:13px;font-weight:600;color:#1d1d1f;}
  ul{margin:0 0 14px;padding-left:20px;}
  li{font-size:14px;color:#1d1d1f;line-height:1.7;padding:2px 0;}
`;

function _base(headline, subline, bodyHtml) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${headline}</title>
<style>${BRAND_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="shell">
    <div class="hdr">
      <div class="hdr-brand">Vicelle</div>
      <h1 class="hdr-title">${headline}</h1>
      ${subline ? `<p class="hdr-sub">${subline}</p>` : ''}
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer-wrap">
      <p class="footer-brand">The Vicelle Team</p>
      <p class="footer-text">We look forward to styling you soon.</p>
      <p class="footer-text">© ${year} Vicelle · All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function _row(label, value) {
  return `<div class="row"><div class="row-label">${label}</div><div class="row-value">${value}</div></div>`;
}

// ─── Activation code ───────────────────────────────────────────────────────────

const sendActivationCodeEmail = async (email, fullName, activationCode) => {
  try {
    const formattedCode = activationCode.toString().split('').join(' ');
    const firstName = fullName?.split(' ')[0] ?? 'there';

    const html = _base(
      'Your Access Code',
      'STYLE-U By Vicelle',
      `<p class="greeting">Hi ${firstName},</p>
       <p>Thank you for joining Vicelle. Your unique access code is ready — use it to complete your registration when the app launches.</p>
       <div class="code-box">
         <span class="code">${formattedCode}</span>
         <p class="code-hint">Keep this code safe. You'll need it to activate your account.</p>
       </div>
       <div class="notice notice-amber">
         <strong>When will I use this?</strong><br/>
         This code is required when the Vicelle app launches. You'll finalize your measurements, choose your subscription tier, and start your curated style journey.
       </div>
       <p class="secondary">Please mark this email as Important or save the code somewhere safe. We'll notify you the moment the app is ready.</p>`
    );

    const text = `Your Vicelle Access Code: ${activationCode}\n\nHi ${firstName},\n\nThank you for joining Vicelle. Use the code above to activate your account when the app launches.\n\n— The Vicelle Team`;

    const result = await getTransporter().sendMail({
      from: config.email.from,
      to: email,
      subject: `Your Vicelle Access Code: ${activationCode}`,
      html,
      text,
    });

    logger.info(`Activation code email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send activation code email to ${email}:`, error);
    throw error;
  }
};

// ─── Order confirmation ────────────────────────────────────────────────────────

const sendOrderConfirmationEmail = async (email, fullName, orderDetails) => {
  try {
    const firstName = fullName?.split(' ')[0] ?? 'there';

    const html = _base(
      'Order Confirmed',
      'Your order is being crafted with care',
      `<p class="greeting">Hi ${firstName},</p>
       <p>Thank you for your order. Here's a summary of what was placed.</p>
       <div class="card">
         ${_row('Order ID', orderDetails.orderId)}
         ${_row('Tailor', orderDetails.tailorName || '—')}
         ${_row('Amount', `₦${(orderDetails.amount ?? 0).toLocaleString()}`)}
         ${_row('Status', orderDetails.status || '—')}
         ${_row('Date', new Date(orderDetails.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }))}
       </div>
       <p class="secondary">You can track your order status any time in the Vicelle app.</p>`
    );

    const result = await getTransporter().sendMail({
      from: config.email.from,
      to: email,
      subject: `Order Confirmed — ${orderDetails.orderId}`,
      html,
      text: `Order ${orderDetails.orderId} confirmed.\nTailor: ${orderDetails.tailorName}\nAmount: ₦${orderDetails.amount}\nStatus: ${orderDetails.status}`,
    });

    logger.info(`Order confirmation email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send order confirmation email to ${email}:`, error);
    throw error;
  }
};

// ─── Payment confirmation ──────────────────────────────────────────────────────

const sendPaymentConfirmationEmail = async (email, fullName, paymentDetails) => {
  try {
    const firstName = fullName?.split(' ')[0] ?? 'there';

    const html = _base(
      'Payment Received',
      'Your payment was processed successfully',
      `<p class="greeting">Hi ${firstName},</p>
       <p>We've received your payment. Your order is now being processed.</p>
       <div class="card">
         ${_row('Reference', paymentDetails.reference)}
         ${_row('Amount', `₦${(paymentDetails.amount ?? 0).toLocaleString()}`)}
         ${_row('Status', paymentDetails.status || '—')}
         ${_row('Date', new Date(paymentDetails.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }))}
       </div>
       <p class="secondary">If you have any questions about this payment, please reach out to us.</p>`
    );

    const result = await getTransporter().sendMail({
      from: config.email.from,
      to: email,
      subject: `Payment Received — ₦${(paymentDetails.amount ?? 0).toLocaleString()}`,
      html,
      text: `Payment of ₦${paymentDetails.amount} confirmed.\nReference: ${paymentDetails.reference}`,
    });

    logger.info(`Payment confirmation email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send payment confirmation email to ${email}:`, error);
    throw error;
  }
};

// ─── Admin: job response ───────────────────────────────────────────────────────

const sendAdminJobResponseEmail = async (adminEmail, tailorName, orderNumber, accepted, reason) => {
  const action = accepted ? 'Accepted' : 'Declined';
  const pill   = accepted ? 'pill-green' : 'pill-red';
  const note   = accepted
    ? 'The job is now in progress.'
    : `Please reassign this order to another tailor.${reason ? `<br/><strong>Reason:</strong> ${reason}` : ''}`;

  const html = _base(
    `Job ${action}`,
    'Tailor Job Response',
    `<p class="greeting">Hi Admin,</p>
     <p>A tailor has responded to a job assignment.</p>
     <span class="pill ${pill}">Job ${action}</span>
     <div class="card">
       ${_row('Tailor', tailorName)}
       ${_row('Order', orderNumber)}
       ${_row('Response', action)}
     </div>
     <p>${note}</p>`
  );

  const text = `Vicelle Admin — Job ${action}\n\nTailor ${tailorName} has ${action.toLowerCase()} the job for order ${orderNumber}.\n${reason && !accepted ? `Reason: ${reason}\n` : ''}${accepted ? 'The job is now in progress.' : 'Please reassign this job.'}`;

  try {
    await getTransporter().sendMail({
      from: config.email.from,
      to: adminEmail,
      subject: `Job ${action} by ${tailorName} — Order ${orderNumber}`,
      html,
      text,
    });
  } catch { /* never block the tailor action */ }
};

// ─── Referral signup ───────────────────────────────────────────────────────────

const sendReferralSignupEmail = async (referrerEmail, referrerName, newUserName) => {
  try {
    const firstName = referrerName?.split(' ')[0] ?? 'there';

    const html = _base(
      'New Referral Signup',
      'Affiliate Programme',
      `<p class="greeting">Hi ${firstName},</p>
       <p>Someone just joined Vicelle using your referral code.</p>
       <div class="card">
         ${_row('New Member', newUserName)}
         ${_row('Status', 'Signed Up')}
       </div>
       <div class="notice notice-green">
         Once <strong>${newUserName}</strong> activates their account and starts a subscription, your referral reward will be automatically credited to your wallet.
       </div>
       <p class="secondary">Keep sharing your referral code to earn more rewards.</p>`
    );

    const result = await getTransporter().sendMail({
      from: config.email.from,
      to: referrerEmail,
      subject: `${newUserName} signed up with your Vicelle referral code`,
      html,
      text: `Hi ${referrerName}, ${newUserName} just signed up to Vicelle using your referral code. Once they subscribe, you'll earn your reward. Keep sharing!`,
    });

    logger.info(`Referral signup email sent to ${referrerEmail}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send referral signup email to ${referrerEmail}:`, error);
    throw error;
  }
};

// ─── Generic ───────────────────────────────────────────────────────────────────

const sendEmail = async (email, subject, htmlContent, textContent) => {
  try {
    const result = await getTransporter().sendMail({
      from: config.email.from,
      to: email,
      subject,
      html: htmlContent,
      text: textContent,
    });
    logger.info(`Email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send email to ${email}:`, error);
    throw error;
  }
};

export default {
  sendActivationCodeEmail,
  sendOrderConfirmationEmail,
  sendPaymentConfirmationEmail,
  sendAdminJobResponseEmail,
  sendReferralSignupEmail,
  sendEmail,
  getTransporter,
};
