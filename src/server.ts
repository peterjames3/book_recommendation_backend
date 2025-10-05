import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { initializeDatabase } from "./config/database.ts";
import authRoutes from "./routes/auth.ts";
import bookRoutes from "./routes/books.ts";
import cartRoutes from "./routes/cart.ts";
import orderRoutes from "./routes/orders.ts";
import recommendationRoutes from "./routes/recommendation.ts";
import searchRoutes from "./routes/search.ts";
import openLibraryRoutes from "./routes/openLibrary.ts";
import testEmailRoutes from "./routes/test-email.ts"; // Add this import
import { emailService } from "./services/emailService.ts";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const emailStatus = await emailService.verifyConnection();

    res.status(200).json({
      success: true,
      message: "LitKenya API is running!",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        email: emailStatus ? "connected" : "disconnected",
      },
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: "LitKenya API is running!",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        email: "error",
      },
      warning: "Email service is unavailable",
    });
  }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/open-library", openLibraryRoutes);
app.use("/api", testEmailRoutes); // Add this line - it will handle /api/test-email

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);

    res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
);

// Initialize services and start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    console.log("✅ Database initialized");

    // Initialize email service
    console.log("📧 Initializing email service...");
    const emailConnected = await emailService.verifyConnection();

    if (emailConnected) {
      console.log("✅ Email service connected successfully");
    } else {
      console.log(
        "⚠️  Email service not available - orders will still work but emails won't be sent"
      );
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 LitKenya API server is running on port ${PORT}`);
      console.log(`📚 Environment: ${process.env.NODE_ENV}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);

      if (process.env.NODE_ENV === "development") {
        console.log(
          `📧 Test email endpoint: http://localhost:${PORT}/api/test-email`
        );
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
