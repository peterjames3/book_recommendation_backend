import express from "express";
import { Order } from "../models/Order.ts";
import { OrderItem } from "../models/Orderitem.ts";
import { Cart } from "../models/Cart.ts";
import { Book } from "../models/Book.ts";
import { authenticateToken, AuthRequest } from "../middleware/auth.ts";
import { body, validationResult } from "express-validator";
import sequelize from "../config/database.ts";

const router = express.Router();

// Create order from cart
interface ShippingAddress {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

interface CreateOrderRequestBody {
    shippingAddress: ShippingAddress;
    paymentMethod: string;
    notes?: string;
}

interface CartItemWithBook extends Cart {
    book: Book;
}

interface OrderItemData {
    bookId: number;
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
        body("shippingAddress.state").notEmpty().withMessage("State is required"),
        body("shippingAddress.zipCode")
            .notEmpty()
            .withMessage("ZIP code is required"),
        body("shippingAddress.country")
            .notEmpty()
            .withMessage("Country is required"),
        body("paymentMethod").notEmpty().withMessage("Payment method is required"),
    ],
    async (
        req: AuthRequest & { body: CreateOrderRequestBody },
        res: express.Response
    ) => {
        const transaction = await sequelize.transaction();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { shippingAddress, paymentMethod, notes } = req.body;

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
                    bookId: Number(book.id),
                    quantity: cartItem.quantity,
                    price: book.price || 0,
                });
            }

            // Create order
            const order: Order = await Order.create(
                {
                    userId: req.userId!,
                    totalAmount: Math.round(totalAmount * 100) / 100,
                    status: "pending",
                    shippingAddress,
                    paymentMethod,
                    notes,
                },
                { transaction }
            );

            // Create order items
            const orderItems: OrderItem[] = await Promise.all(
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
            const completeOrder: Order | null = await Order.findByPk(order.id, {
                include: [
                    {
                        model: OrderItem,
                        as: "items",
                        include: [{ model: Book, as: "book" }],
                    },
                ],
            });

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

// Get user's orders
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: any = { userId: req.userId };
    if (status) {
      whereClause.status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: OrderItem,
          as: "items",
          include: [{ model: Book, as: "book" }],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          totalItems: count,
          itemsPerPage: Number(limit),
          hasMore: offset + orders.length < count,
        },
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get orders",
    });
  }
});

// Get specific order
router.get("/:orderId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.userId,
      },
      include: [
        {
          model: OrderItem,
          as: "items",
          include: [{ model: Book, as: "book" }],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get order",
    });
  }
});

// Cancel order (only if status is pending)
router.put(
  "/:orderId/cancel",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { orderId } = req.params;

      const order = await Order.findOne({
        where: {
          id: orderId,
          userId: req.userId,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Order cannot be cancelled. Current status: " + order.status,
        });
      }

      order.status = "cancelled";
      await order.save();

      res.json({
        success: true,
        message: "Order cancelled successfully",
        data: order,
      });
    } catch (error) {
      console.error("Cancel order error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cancel order",
      });
    }
  }
);

// Get order statistics for user
router.get(
  "/stats/summary",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const orders = await Order.findAll({
        where: { userId: req.userId },
        attributes: ["status", "totalAmount", "createdAt"],
      });

      const stats = {
        totalOrders: orders.length,
        totalSpent: orders.reduce(
          (sum, order) => sum + Number(order.totalAmount),
          0
        ),
        ordersByStatus: {
          pending: orders.filter((o) => o.status === "pending").length,
          confirmed: orders.filter((o) => o.status === "confirmed").length,
          shipped: orders.filter((o) => o.status === "shipped").length,
          delivered: orders.filter((o) => o.status === "delivered").length,
          cancelled: orders.filter((o) => o.status === "cancelled").length,
        },
        recentOrders: orders
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 5),
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get order stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get order statistics",
      });
    }
  }
);

// Reorder (create new order from existing order)
interface ReorderRequestBody {
    shippingAddress: ShippingAddress;
    paymentMethod: string;
    notes?: string;
}

interface OriginalOrderWithItems extends Order {
    items: (OrderItem & { book: Book })[];
}

interface NewOrderItemData {
    bookId: number;
    quantity: number;
    price: number;
}

router.post(
    "/:orderId/reorder",
    authenticateToken,
    [
        body("shippingAddress")
            .isObject()
            .withMessage("Shipping address is required"),
        body("paymentMethod").notEmpty().withMessage("Payment method is required"),
    ],
    async (
        req: AuthRequest & { body: ReorderRequestBody },
        res: express.Response
    ) => {
        const transaction = await sequelize.transaction();

        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { orderId } = req.params;
            const { shippingAddress, paymentMethod, notes } = req.body;

            // Get original order
            const originalOrder: OriginalOrderWithItems | null = await Order.findOne({
                where: {
                    id: orderId,
                    userId: req.userId,
                },
                include: [
                    {
                        model: OrderItem,
                        as: "items",
                        include: [{ model: Book, as: "book" }],
                    },
                ],
                transaction,
            });

            if (!originalOrder) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Original order not found",
                });
            }

            // Check availability and calculate new total
            let totalAmount = 0;
            const newOrderItemsData: NewOrderItemData[] = [];

            for (const item of originalOrder.items) {
                const book: Book = item.book;

                if (book.availability !== "available") {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Book "${book.title}" is no longer available`,
                    });
                }

                const itemTotal = (book.price || 0) * item.quantity;
                totalAmount += itemTotal;

                newOrderItemsData.push({
                    bookId: Number(book.id),
                    quantity: item.quantity,
                    price: book.price || 0,
                });
            }

            // Create new order
            const newOrder: Order = await Order.create(
                {
                    userId: req.userId!,
                    totalAmount: Math.round(totalAmount * 100) / 100,
                    status: "pending",
                    shippingAddress,
                    paymentMethod,
                    notes,
                },
                { transaction }
            );

            // Create new order items
            await Promise.all(
                newOrderItemsData.map((itemData) =>
                    OrderItem.create(
                        {
                            orderId: newOrder.id,
                            ...itemData,
                        },
                        { transaction }
                    )
                )
            );

            await transaction.commit();

            // Fetch complete new order
            const completeNewOrder: Order | null = await Order.findByPk(newOrder.id, {
                include: [
                    {
                        model: OrderItem,
                        as: "items",
                        include: [{ model: Book, as: "book" }],
                    },
                ],
            });

            res.status(201).json({
                success: true,
                message: "Order recreated successfully",
                data: completeNewOrder,
            });
        } catch (error) {
            await transaction.rollback();
            console.error("Reorder error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to recreate order",
            });
        }
    }
);

export default router;
