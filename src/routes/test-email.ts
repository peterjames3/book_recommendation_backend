// routes/test-email.ts
import express from "express";
import { emailService } from "../services/emailService.ts";

const router = express.Router();

router.get("/test-email", async (req, res) => {
  try {
    // Test connection
    const isConnected = await emailService.verifyConnection();

    if (!isConnected) {
      return res.status(500).json({
        success: false,
        message: "Email server connection failed",
      });
    }

    // Test with mock order data
    const mockOrder = {
      id: "test-order-123",
      customerEmail: "test@example.com",
      customerPhone: "+1234567890",
      totalAmount: 49.99,
      status: "pending",
      shippingAddress: {
        street: "123 Test St",
        city: "Test City",
        state: "TS",
        zipCode: "12345",
        country: "Test Country",
      },
      paymentMethod: "cash_on_delivery",
      notes: "Test order notes",
      items: [
        {
          book: {
            title: "Test Book 1",
          },
          quantity: 2,
          price: 19.99,
        },
        {
          book: {
            title: "Test Book 2",
          },
          quantity: 1,
          price: 10.0,
        },
      ],
      createdAt: new Date(),
      userId: "test-user-123",
    } as any;

    // Send test emails
    await emailService.sendOrderConfirmation(mockOrder);
    await emailService.sendAdminNotification(mockOrder);

    res.json({
      success: true,
      message: "Test emails sent successfully",
    });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({
      success: false,
      message: "Test email failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
