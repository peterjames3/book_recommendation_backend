import express from "express";
import { Cart } from "../models/Cart";
import { Book } from "../models/Book";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { body, validationResult } from "express-validator";

const router = express.Router();

// Get user's cart
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const cartItems = await Cart.findAll({
      where: { userId: req.userId },
      include: [
        {
          model: Book,
          as: "book",
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Calculate totals
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cartItems.reduce((sum, item) => {
      const price = item.book.price || 0;
      return sum + price * item.quantity;
    }, 0);

    res.json({
      success: true,
      data: {
        items: cartItems,
        totalItems,
        totalPrice: Math.round(totalPrice * 100) / 100, // Round to 2 decimal places
      },
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get cart",
    });
  }
});

// Add item to cart
interface AddToCartRequestBody {
    bookId: string;
    quantity?: number;
}

interface AddToCartResponse {
    success: boolean;
    message?: string;
    errors?: any[];
    data?: any;
}

router.post(
    "/add",
    authenticateToken,
    [
        body("bookId").isUUID().withMessage("Valid book ID is required"),
        body("quantity")
            .isInt({ min: 1 })
            .withMessage("Quantity must be at least 1"),
    ],
    async (
        req: AuthRequest & { body: AddToCartRequestBody },
        res: express.Response<AddToCartResponse>
    ) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { bookId, quantity = 1 } = req.body;

            // Check if book exists and is available
            const book = await Book.findByPk(bookId);
            if (!book) {
                return res.status(404).json({
                    success: false,
                    message: "Book not found",
                });
            }

            if (book.availability !== "available") {
                return res.status(400).json({
                    success: false,
                    message: "Book is not available for purchase",
                });
            }

            // Check if item already exists in cart
            const existingCartItem = await Cart.findOne({
                where: {
                    userId: req.userId,
                    bookId,
                },
            });

            if (existingCartItem) {
                // Update quantity
                existingCartItem.quantity += Number(quantity);
                await existingCartItem.save();

                const updatedItem = await Cart.findByPk(existingCartItem.id, {
                    include: [{ model: Book, as: "book" }],
                });

                res.json({
                    success: true,
                    message: "Cart updated successfully",
                    data: updatedItem,
                });
            } else {
                // Create new cart item
                const cartItem = await Cart.create({
                    userId: req.userId!,
                    bookId,
                    quantity: Number(quantity),
                });

                const newItem = await Cart.findByPk(cartItem.id, {
                    include: [{ model: Book, as: "book" }],
                });

                res.status(201).json({
                    success: true,
                    message: "Item added to cart successfully",
                    data: newItem,
                });
            }
        } catch (error) {
            console.error("Add to cart error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to add item to cart",
            });
        }
    }
);

// Update cart item quantity
interface UpdateCartItemRequestBody {
    quantity: number;
}

interface UpdateCartItemResponse {
    success: boolean;
    message?: string;
    errors?: any[];
    data?: any;
}

router.put(
    "/update/:itemId",
    authenticateToken,
    [
        body("quantity")
            .isInt({ min: 1 })
            .withMessage("Quantity must be at least 1"),
    ],
    async (
        req: AuthRequest & { body: UpdateCartItemRequestBody },
        res: express.Response<UpdateCartItemResponse>
    ) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { itemId } = req.params;
            const { quantity } = req.body;

            const cartItem = await Cart.findOne({
                where: {
                    id: itemId,
                    userId: req.userId,
                },
            });

            if (!cartItem) {
                return res.status(404).json({
                    success: false,
                    message: "Cart item not found",
                });
            }

            cartItem.quantity = Number(quantity);
            await cartItem.save();

            const updatedItem = await Cart.findByPk(cartItem.id, {
                include: [{ model: Book, as: "book" }],
            });

            res.json({
                success: true,
                message: "Cart item updated successfully",
                data: updatedItem,
            });
        } catch (error) {
            console.error("Update cart item error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to update cart item",
            });
        }
    }
);

// Remove item from cart
router.delete(
  "/remove/:itemId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { itemId } = req.params;

      const cartItem = await Cart.findOne({
        where: {
          id: itemId,
          userId: req.userId,
        },
      });

      if (!cartItem) {
        return res.status(404).json({
          success: false,
          message: "Cart item not found",
        });
      }

      await cartItem.destroy();

      res.json({
        success: true,
        message: "Item removed from cart successfully",
      });
    } catch (error) {
      console.error("Remove cart item error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove item from cart",
      });
    }
  }
);

// Clear entire cart
router.delete("/clear", authenticateToken, async (req: AuthRequest, res) => {
  try {
    await Cart.destroy({
      where: { userId: req.userId },
    });

    res.json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear cart",
    });
  }
});

// Get cart item count
router.get("/count", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const cartItems = await Cart.findAll({
      where: { userId: req.userId },
    });

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      data: { count: totalItems },
    });
  } catch (error) {
    console.error("Get cart count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get cart count",
    });
  }
});

export default router;
