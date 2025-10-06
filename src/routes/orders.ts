// routes/orders.ts - Updated with proper TypeScript
import express from "express";
import { Order } from "../models/Order.ts";
import { OrderItem } from "../models/Orderitem.ts";
import { Cart } from "../models/Cart.ts";
import { Book } from "../models/Book.ts";
import { authenticateToken, AuthRequest } from "../middleware/auth.ts";
import { body, validationResult } from "express-validator";
import sequelize from "../config/database.ts";
import { emailService } from "../services/emailService.ts";

const router = express.Router();

// Create order from cart
interface CreateOrderRequestBody {
  shippingAddress: {
    street: string;
    city: string;
    town: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: string;
  notes?: string;
  customerEmail: string;
  customerPhone: string;
}

interface CartItemWithBook extends Cart {
  book: Book;
}

interface OrderItemData {
  bookId: string; // Changed to string to match UUID
  quantity: number;
  price: number;
}

router.post(
  "/create",
  authenticateToken,
  [
    body("shippingAddress")
      .isObject()
      .withMessage("Shipping address is required"),
    body("shippingAddress.street")
      .notEmpty()
      .withMessage("Street address is required"),
    body("shippingAddress.city").notEmpty().withMessage("City is required"),
    body("shippingAddress.town").notEmpty().withMessage("Town is required"),
    body("shippingAddress.zipCode")
      .notEmpty()
      .withMessage("ZIP code is required"),
    body("shippingAddress.country")
      .notEmpty()
      .withMessage("Country is required"),
    body("paymentMethod").notEmpty().withMessage("Payment method is required"),
    body("customerEmail")
      .isEmail()
      .withMessage("Valid customer email is required"),
    body("customerPhone")
      .notEmpty()
      .withMessage("Customer phone number is required")
      .isLength({ min: 10 })
      .withMessage("Phone number must be at least 10 characters"),
  ],
  async (
    req: AuthRequest & { body: CreateOrderRequestBody },
    res: express.Response
  ) => {
    const transaction = await sequelize.transaction();

    try {
      // ADD THIS LOGGING to see what's actually being received
      console.log(
        "📨 Received order request body:",
        JSON.stringify(req.body, null, 2)
      );
      console.log("👤 User ID:", req.userId);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const {
        shippingAddress,
        paymentMethod,
        notes,
        customerEmail,
        customerPhone,
      } = req.body;

      // Get user's cart items
      const cartItems: CartItemWithBook[] = await Cart.findAll({
        where: { userId: req.userId },
        include: [{ model: Book, as: "book" }],
        transaction,
      });

      if (cartItems.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      // Calculate total amount
      let totalAmount = 0;
      const orderItemsData: OrderItemData[] = [];

      for (const cartItem of cartItems) {
        const book: Book = cartItem.book;

        // Check book availability
        if (book.availability !== "available") {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Book "${book.title}" is no longer available`,
          });
        }

        const itemTotal = (book.price || 0) * cartItem.quantity;
        totalAmount += itemTotal;

        orderItemsData.push({
          bookId: book.id, // This should be UUID string
          quantity: cartItem.quantity,
          price: book.price || 0,
        });
      }

      // Create order with customer contact info
      const order = await Order.create(
        {
          userId: req.userId!,
          totalAmount: Math.round(totalAmount * 100) / 100,
          status: "pending",
          shippingAddress,
          paymentMethod,
          notes: notes || "",
          customerEmail,
          customerPhone,
        },
        { transaction }
      );

      // Create order items
      await Promise.all(
        orderItemsData.map((itemData) =>
          OrderItem.create(
            {
              orderId: order.id,
              ...itemData,
            },
            { transaction }
          )
        )
      );

      // Clear user's cart
      await Cart.destroy({
        where: { userId: req.userId },
        transaction,
      });

      await transaction.commit();

      // Fetch complete order with items and books
      const completeOrder = await Order.findByPk(order.id, {
        include: [
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Book, as: "book" }],
          },
        ],
      });

      // Send email notifications
      await sendOrderNotifications(completeOrder);

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: completeOrder,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("Create order error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create order",
      });
    }
  }
);

// Email notification function
async function sendOrderNotifications(order: any) {
  try {
    // Send email to customer
    await sendCustomerOrderConfirmation(order);

    // Send email to admin
    await sendAdminOrderNotification(order);

    console.log("Order notifications sent successfully");
  } catch (error) {
    console.error("Failed to send order notifications:", error);
    // Don't throw error - email failure shouldn't break order creation
  }
}

async function sendCustomerOrderConfirmation(order: any) {
  // Implement with your email service
  console.log("Sending order confirmation to:", order.customerEmail);
  console.log("Order details:", {
    orderId: order.id,
    total: order.totalAmount,
    items: order.items?.length || 0,
  });

  // TODO: Integrate with your email service (Nodemailer, SendGrid, etc.)
  await emailService.sendOrderConfirmation(order);
}

async function sendAdminOrderNotification(order: any) {
  // Implement admin notification
  console.log("Sending admin notification for order:", order.id);
  console.log("Customer:", order.customerEmail, order.customerPhone);

  // TODO: Integrate with your email service
  await emailService.sendAdminNotification(order);
}

// ... rest of your existing routes remain the same
export default router;
