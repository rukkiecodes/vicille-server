import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from '../core/logger/index.js';

let transporter;

/**
 * Initialize nodemailer transporter
 */
const initializeTransporter = () => {
  try {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure, // true for 465, false for other ports
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });

    logger.info('Email transporter initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize email transporter:', error);
    throw error;
  }
};

/**
 * Get or create transporter
 */
const getTransporter = () => {
  if (!transporter) {
    initializeTransporter();
  }
  return transporter;
};

/**
 * Send activation code email with STYLE-U By VICELLE template
 */
const sendActivationCodeEmail = async (email, fullName, activationCode) => {
  try {
    const transporter = getTransporter();

    // Format the activation code with spaces between each digit
    const formattedCode = activationCode.toString().split('').join(' ');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
              color: #333; 
              line-height: 1.6;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 20px; 
              border-radius: 10px 10px 0 0; 
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 32px;
              font-weight: 300;
              letter-spacing: 1px;
            }
            .header h2 {
              margin: 10px 0 0;
              font-size: 18px;
              font-weight: 300;
              opacity: 0.9;
            }
            .content { 
              background-color: #ffffff;
              padding: 40px 30px; 
              border: 1px solid #eaeef2;
              border-top: none;
              border-radius: 0 0 10px 10px;
            }
            .greeting {
              font-size: 18px;
              margin-bottom: 20px;
            }
            .message {
              color: #4a5568;
              margin-bottom: 30px;
            }
            .code-box { 
              background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
              padding: 30px; 
              border-radius: 10px; 
              text-align: center; 
              margin: 30px 0; 
              border: 2px dashed #667eea;
            }
            .code { 
              font-size: 42px; 
              font-weight: bold; 
              letter-spacing: 8px; 
              color: #667eea; 
              font-family: 'Courier New', monospace;
            }
            .importance-note {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 25px 0;
              border-radius: 5px;
            }
            .importance-note p {
              margin: 0;
              color: #856404;
            }
            .action-required {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
            }
            .action-required h3 {
              margin: 0 0 10px 0;
              color: #333;
            }
            .action-required p {
              margin: 5px 0;
              color: #4a5568;
            }
            .footer { 
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #eaeef2;
              text-align: center;
            }
            .footer p {
              color: #718096;
              font-size: 14px;
              margin: 5px 0;
            }
            .footer .brand {
              font-weight: bold;
              color: #667eea;
              font-size: 16px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>STYLE-U By VICELLE</h1>
              <h2>Your Premium Style Journey Begins</h2>
            </div>
            <div class="content">
              <div class="greeting">
                <p>Hi ${fullName},</p>
              </div>
              
              <div class="message">
                <p>Thank you for joining the Vicelle waiting list. To ensure a seamless transition to our premium mobile experience, we have generated your unique Activation Code.</p>
              </div>
              
              <div class="code-box">
                <div class="code">${formattedCode}</div>
              </div>
              
              <div class="importance-note">
                <p><strong>Why is this important?</strong><br>
                This code is the only way to complete your registration once the Vicelle App launches (Late Feb / March 2026). On the app, you will finalize your measurements, select your subscription tier, and begin your curated style journey.</p>
              </div>
              
              <div class="action-required">
                <h3>📌 Action Required:</h3>
                <p>Please mark this email as <strong>Important</strong> or save this code in a safe place. You will be notified the moment the app is ready for download.</p>
              </div>
              
              <div class="footer">
                <p class="brand">— The Vicelle Team</p>
                <p>We look forward to styling you soon.</p>
                <p>&copy; ${new Date().getFullYear()} Vicelle. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const textContent = `
STYLE-U By VICELLE - Your Vicelle Access Key: ${activationCode} (Save This Email)

Welcome to STYLE-U By VICELLE

Hi ${fullName},

Thank you for joining the Vicelle waiting list. To ensure a seamless transition to our premium mobile experience, we have generated your unique Activation Code.

${activationCode}

Why is this important?
This code is the only way to complete your registration once the Vicelle App launches (Late Feb / March 2026). On the app, you will finalize your measurements, select your subscription tier, and begin your curated style journey.

Action Required:
Please mark this email as Important or save this code in a safe place. You will be notified the moment the app is ready for download.

We look forward to styling you soon.

— The Vicelle Team
    `;

    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: `Your Vicelle Access Key: ${activationCode} (Save This Email)`,
      html: htmlContent,
      text: textContent,
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Activation code email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send activation code email to ${email}:`, error);
    throw error;
  }
};

/**
 * Send order confirmation email (keep existing template or update as needed)
 */
const sendOrderConfirmationEmail = async (email, fullName, orderDetails) => {
  try {
    const transporter = getTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { padding: 30px; background: white; border: 1px solid #eaeef2; border-top: none; border-radius: 0 0 10px 10px; }
            .order-details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeef2; color: #718096; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>STYLE-U By VICELLE</h1>
              <h2>Order Confirmation</h2>
            </div>
            <div class="content">
              <p>Hi ${fullName},</p>
              <p>Thank you for placing an order with Vicelle. Here are your order details:</p>
              
              <div class="order-details">
                <p><strong>Order ID:</strong> ${orderDetails.orderId}</p>
                <p><strong>Tailor:</strong> ${orderDetails.tailorName}</p>
                <p><strong>Amount:</strong> ₦${orderDetails.amount?.toLocaleString()}</p>
                <p><strong>Status:</strong> ${orderDetails.status}</p>
                <p><strong>Date:</strong> ${new Date(orderDetails.date).toLocaleDateString()}</p>
              </div>
              
              <p>You can track your order status in your Vicelle dashboard.</p>
              
              <div class="footer">
                <p>— The Vicelle Team</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: `Order Confirmation - ${orderDetails.orderId}`,
      html: htmlContent,
      text: `Order ID: ${orderDetails.orderId}\nAmount: ₦${orderDetails.amount}\nStatus: ${orderDetails.status}`,
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Order confirmation email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send order confirmation email to ${email}:`, error);
    throw error;
  }
};

/**
 * Send payment confirmation email (keep existing or update as needed)
 */
const sendPaymentConfirmationEmail = async (email, fullName, paymentDetails) => {
  try {
    const transporter = getTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { padding: 30px; background: white; border: 1px solid #eaeef2; border-top: none; border-radius: 0 0 10px 10px; }
            .payment-box { background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeef2; color: #718096; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>STYLE-U By VICELLE</h1>
              <h2>Payment Confirmed</h2>
            </div>
            <div class="content">
              <p>Hi ${fullName},</p>
              <p>Your payment has been successfully processed.</p>
              
              <div class="payment-box">
                <p><strong>Reference:</strong> ${paymentDetails.reference}</p>
                <p><strong>Amount:</strong> ₦${paymentDetails.amount?.toLocaleString()}</p>
                <p><strong>Status:</strong> ${paymentDetails.status}</p>
                <p><strong>Date:</strong> ${new Date(paymentDetails.date).toLocaleDateString()}</p>
              </div>
              
              <p>Thank you for your payment. Your order is being processed.</p>
              
              <div class="footer">
                <p>— The Vicelle Team</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: `Payment Confirmation - ₦${paymentDetails.amount?.toLocaleString()}`,
      html: htmlContent,
      text: `Payment of ₦${paymentDetails.amount} confirmed.\nReference: ${paymentDetails.reference}`,
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Payment confirmation email sent to ${email}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error(`Failed to send payment confirmation email to ${email}:`, error);
    throw error;
  }
};

/**
 * Send generic email
 */
const sendEmail = async (email, subject, htmlContent, textContent) => {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: config.email.from,
      to: email,
      subject,
      html: htmlContent,
      text: textContent,
    };

    const result = await transporter.sendMail(mailOptions);
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
  sendEmail,
  getTransporter,
};
