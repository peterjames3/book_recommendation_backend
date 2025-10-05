// services/emailService.ts
import nodemailer from 'nodemailer'
import { Order } from "../models/Order.ts";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "465"),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, 
      },
    });
  }

  // Verify email configuration
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log("✅ Email server connection verified");
      return true;
    } catch (error) {
      console.error("❌ Email server connection failed:", error);
      return false;
    }
  }

  // Send order confirmation to customer
  async sendOrderConfirmation(order: Order): Promise<void> {
    try {
      const mailOptions = {
        from: `"BookStore" <${
          process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
        }>`,
        to: order.customerEmail,
        subject: `Order Confirmation - #${order.id.slice(0, 8).toUpperCase()}`,
        html: this.generateCustomerEmailTemplate(order),
        text: this.generateCustomerTextTemplate(order),
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log("✅ Order confirmation email sent:", result.messageId);
    } catch (error) {
      console.error("❌ Failed to send order confirmation:", error);
      throw error;
    }
  }

  // Send order notification to admin
  async sendAdminNotification(order: Order): Promise<void> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;

      const mailOptions = {
        from: `"BookStore Orders" <${
          process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
        }>`,
        to: adminEmail,
        subject: `📦 New Order Received - #${order.id
          .slice(0, 8)
          .toUpperCase()}`,
        html: this.generateAdminEmailTemplate(order),
        text: this.generateAdminTextTemplate(order),
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log("✅ Admin notification email sent:", result.messageId);
    } catch (error) {
      console.error("❌ Failed to send admin notification:", error);
      throw error;
    }
  }

  // Customer HTML Email Template
  private generateCustomerEmailTemplate(order: Order): string {
    const orderDate = new Date(order.createdAt).toLocaleDateString();
    const shortOrderId = order.id.slice(0, 8).toUpperCase();

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f9f9f9;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
        }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
        }
        .content { 
            padding: 30px; 
        }
        .order-card { 
            background: #f8fafc; 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            padding: 20px; 
            margin: 20px 0; 
        }
        .item-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 10px 0; 
            border-bottom: 1px solid #e2e8f0; 
        }
        .total-row { 
            display: flex; 
            justify-content: space-between; 
            font-weight: bold; 
            font-size: 1.1em; 
            padding: 15px 0; 
            border-top: 2px solid #e2e8f0; 
        }
        .footer { 
            text-align: center; 
            padding: 20px; 
            color: #666; 
            font-size: 0.9em; 
            background: #f8fafc;
        }
        .status-badge {
            background: #10b981;
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 Thank You for Your Order!</h1>
            <p>We're preparing your books for delivery</p>
        </div>
        
        <div class="content">
            <div style="text-align: center; margin-bottom: 20px;">
                <span class="status-badge">Order #${shortOrderId}</span>
                <p>Placed on ${orderDate}</p>
            </div>

            <div class="order-card">
                <h3 style="margin-top: 0; color: #2d3748;">Order Summary</h3>
                
                ${order.items
                  ?.map(
                    (item) => `
                <div class="item-row">
                    <div>
                        <strong>${item.book?.title}</strong><br>
                        <small style="color: #666;">Qty: ${
                          item.quantity
                        } × $${item.price.toFixed(2)}</small>
                    </div>
                    <div>$${(item.quantity * item.price).toFixed(2)}</div>
                </div>
                `
                  )
                  .join("")}
                
                <div class="total-row">
                    <div>Total Amount:</div>
                    <div>$${order.totalAmount.toFixed(2)}</div>
                </div>
            </div>

            <div style="background: #e6fffa; border: 1px solid #81e6d9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #234e52;">💰 Payment on Delivery</h4>
                <p style="margin: 0; color: #234e52;">
                    You'll pay <strong>$${order.totalAmount.toFixed(
                      2
                    )}</strong> when your order is delivered.
                </p>
            </div>

            <div class="order-card">
                <h4 style="margin-top: 0;">Delivery Information</h4>
                <p>
                    <strong>Address:</strong><br>
                    ${order.shippingAddress.street}<br>
                    ${order.shippingAddress.city}, ${
      order.shippingAddress.town
    } ${order.shippingAddress.zipCode}<br>
                    ${order.shippingAddress.country}
                </p>
                <p><strong>Phone:</strong> ${order.customerPhone}</p>
                ${
                  order.notes
                    ? `<p><strong>Delivery Notes:</strong> ${order.notes}</p>`
                    : ""
                }
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <p><strong>What happens next?</strong></p>
                <p>We'll contact you within 24 hours to confirm delivery timing.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>If you have any questions, reply to this email or contact us at<br>
            <strong>support@bookstore.com</strong> or call <strong>(555) 123-READ</strong></p>
            <p>© 2024 BookStore. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  // Customer Text Template (for plain text fallback)
  private generateCustomerTextTemplate(order: Order): string {
    const shortOrderId = order.id.slice(0, 8).toUpperCase();

    return `
ORDER CONFIRMATION - #${shortOrderId}

Thank you for your order! We're preparing your books for delivery.

ORDER SUMMARY:
${order.items
  ?.map(
    (item) =>
      `- ${item.book?.title} (Qty: ${item.quantity} × $${item.price.toFixed(
        2
      )}) = $${(item.quantity * item.price).toFixed(2)}`
  )
  .join("\n")}

Total Amount: $${order.totalAmount.toFixed(2)}

PAYMENT ON DELIVERY:
You'll pay $${order.totalAmount.toFixed(2)} when your order is delivered.

DELIVERY INFORMATION:
${order.shippingAddress.street}
${order.shippingAddress.city}, ${order.shippingAddress.town} ${
      order.shippingAddress.zipCode
    }
${order.shippingAddress.country}
Phone: ${order.customerPhone}
${order.notes ? `Notes: ${order.notes}` : ""}

What happens next?
We'll contact you within 24 hours to confirm delivery timing.

If you have any questions, contact us at support@bookstore.com or call (555) 123-READ.

© 2024 BookStore. All rights reserved.
    `;
  }

  // Admin HTML Email Template
  private generateAdminEmailTemplate(order: Order): string {
    const shortOrderId = order.id.slice(0, 8).toUpperCase();
    const orderDate = new Date(order.createdAt).toLocaleString();

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Order Notification</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .alert { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 15px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 NEW ORDER RECEIVED</h1>
            <p>Order #${shortOrderId} - ${orderDate}</p>
        </div>
        
        <div class="content">
            <div class="alert">
                <strong>🚨 New order requires attention!</strong>
            </div>

            <div class="info-card">
                <h3>Customer Information</h3>
                <p><strong>Email:</strong> ${order.customerEmail}</p>
                <p><strong>Phone:</strong> ${order.customerPhone}</p>
                <p><strong>User ID:</strong> ${order.userId}</p>
            </div>

            <div class="info-card">
                <h3>Delivery Address</h3>
                <p>
                    ${order.shippingAddress.street}<br>
                    ${order.shippingAddress.city}, ${
      order.shippingAddress.town
    } ${order.shippingAddress.zipCode}<br>
                    ${order.shippingAddress.country}
                </p>
                ${
                  order.notes
                    ? `<p><strong>Notes:</strong> ${order.notes}</p>`
                    : ""
                }
            </div>

            <div class="info-card">
                <h3>Order Details</h3>
                <p><strong>Total:</strong> $${order.totalAmount.toFixed(2)}</p>
                <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
                <p><strong>Status:</strong> ${order.status}</p>
                
                <h4>Items (${order.items?.length || 0}):</h4>
                ${order.items
                  ?.map(
                    (item) => `
                <div style="border-bottom: 1px solid #e2e8f0; padding: 8px 0;">
                    ${item.book?.title} - Qty: ${item.quantity} - $${(
                      item.quantity * item.price
                    ).toFixed(2)}
                </div>
                `
                  )
                  .join("")}
            </div>

            <div style="text-align: center; margin: 20px 0;">
                <p>
                    <a href="${process.env.ADMIN_URL}/orders/${order.id}" 
                       style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        📋 View Order in Admin Panel
                    </a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
  }

  // Admin Text Template
  private generateAdminTextTemplate(order: Order): string {
    const shortOrderId = order.id.slice(0, 8).toUpperCase();

    return `
NEW ORDER NOTIFICATION - #${shortOrderId}

🚨 NEW ORDER REQUIRES ATTENTION!

CUSTOMER INFORMATION:
Email: ${order.customerEmail}
Phone: ${order.customerPhone}
User ID: ${order.userId}

DELIVERY ADDRESS:
${order.shippingAddress.street}
${order.shippingAddress.city}, ${order.shippingAddress.town} ${
      order.shippingAddress.zipCode
    }
${order.shippingAddress.country}
${order.notes ? `Notes: ${order.notes}` : ""}

ORDER DETAILS:
Total: $${order.totalAmount.toFixed(2)}
Payment Method: ${order.paymentMethod}
Status: ${order.status}

ITEMS:
${order.items
  ?.map(
    (item) =>
      `- ${item.book?.title} - Qty: ${item.quantity} - $${(
        item.quantity * item.price
      ).toFixed(2)}`
  )
  .join("\n")}

View order in admin panel: ${process.env.ADMIN_URL}/orders/${order.id}
    `;
  }
}

// Export singleton instance
export const emailService = new EmailService();
