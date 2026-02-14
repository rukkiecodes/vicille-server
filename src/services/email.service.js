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
 * Send activation code email
 */
const sendActivationCodeEmail = async (email, fullName, activationCode) => {
  try {
    const transporter = getTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
            .content { padding: 20px 0; }
            .code-box { background-color: #f0f0f0; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0; }
            .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000; }
            .footer { color: #666; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Vicelle! 👋</h1>
            </div>
            <div class="content">
              <p>Hi ${fullName},</p>
              <p>Thank you for signing up with Vicelle. To complete your registration, please use the activation code below:</p>
              
              <div class="code-box">
                <div class="code">${activationCode}</div>
              </div>
              
              <p>This code will expire in 365 days. Do not share this code with anyone.</p>
              
              <p>If you didn't sign up for this account, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 Vicelle. All rights reserved.</p>
              <p>Vicelle - Premium Fashion & Tailoring Services</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: 'Your Vicelle Activation Code',
      html: htmlContent,
      text: `Your activation code is: ${activationCode}. This code will expire in 365 days.`,
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
 * Send order confirmation email
 */
const sendOrderConfirmationEmail = async (email, fullName, orderDetails) => {
  try {
    const transporter = getTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
            .content { padding: 20px 0; }
            .order-details { background-color: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { color: #666; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmation 📦</h1>
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
            </div>
            <div class="footer">
              <p>&copy; 2026 Vicelle. All rights reserved.</p>
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
 * Send payment confirmation email
 */
const sendPaymentConfirmationEmail = async (email, fullName, paymentDetails) => {
  try {
    const transporter = getTransporter();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
            .content { padding: 20px 0; }
            .payment-box { background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { color: #666; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Confirmed ✅</h1>
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
            </div>
            <div class="footer">
              <p>&copy; 2026 Vicelle. All rights reserved.</p>
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
