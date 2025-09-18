import express from "express";
import { Op } from "sequelize";
import { Book } from "../models/Book.ts";
import { User } from "../models/User.ts";
import {
  authenticateToken,
  optionalAuth,
  AuthRequest,
} from "../middleware/auth.ts";
import llmService from "../services/llmServices.ts";

const router = express.Router();

// Get personalized recommendations for authenticated user
router.get(
  "/personalized",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const { limit = 10 } = req.query;

      const user = await User.findByPk(req.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get available books for recommendations
      const availableBooks = await Book.findAll({
        where: {
          availability: "available",
        },
        order: [["rating", "DESC"]],
        limit: 100, // Get top 100 books to choose from
      });

      if (availableBooks.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: "No books available for recommendations",
        });
      }

      // Generate personalized recommendations using LLM
      const recommendations =
        await llmService.generatePersonalizedRecommendations(
          user,
          availableBooks,
          Number(limit)
        );

      res.json({
        success: true,
        data: recommendations,
        userPreferences: user.preferences,
      });
    } catch (error) {
      console.error("Personalized recommendations error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get personalized recommendations",
      });
    }
  }
);

// Get recommendations based on a specific book
router.get("/similar/:bookId", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;
    const { limit = 5 } = req.query;

    const targetBook = await Book.findByPk(bookId);
    if (!targetBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // Get available books for similarity comparison
    const availableBooks = await Book.findAll({
      where: {
        id: { [Op.ne]: bookId },
        availability: "available",
      },
      limit: 50,
    });

    // Find similar books using LLM
    const similarBooks = await llmService.findSimilarBooks(
      targetBook,
      availableBooks,
      Number(limit)
    );

    res.json({
      success: true,
      data: {
        targetBook,
        similarBooks,
      },
    });
  } catch (error) {
    console.error("Similar books error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get similar books",
    });
  }
});

// Get recommendations by genre
router.get("/by-genre/:genre", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { genre } = req.params;
    const { limit = 10, excludeBookIds = [] } = req.query;

    const excludeIds = Array.isArray(excludeBookIds)
      ? excludeBookIds
      : excludeBookIds
      ? [excludeBookIds]
      : [];

    const books = await Book.findAll({
      where: {
        categories: {
          [Op.contains]: [genre],
        },
        ...(excludeIds.length > 0 && {
          id: { [Op.notIn]: excludeIds },
        }),
        availability: "available",
      },
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
      ],
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: {
        genre,
        books,
      },
    });
  } catch (error) {
    console.error("Genre recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get genre recommendations",
    });
  }
});

// Get trending/popular recommendations
router.get("/trending", async (req, res) => {
  try {
    const { limit = 12, timeframe = "week" } = req.query;

    // For now, we'll use rating and ratingsCount as proxy for trending
    // In a real app, you'd track views, purchases, etc.
    let dateFilter = {};

    if (timeframe === "day") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateFilter = { createdAt: { [Op.gte]: yesterday } };
    } else if (timeframe === "week") {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter = { createdAt: { [Op.gte]: lastWeek } };
    } else if (timeframe === "month") {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateFilter = { createdAt: { [Op.gte]: lastMonth } };
    }

    const trendingBooks = await Book.findAll({
      where: {
        ...dateFilter,
        availability: "available",
        rating: { [Op.gte]: 3.5 },
      },
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: Number(limit),
    });

    // If not enough recent books, fall back to all-time popular
    if (trendingBooks.length < Number(limit)) {
      const popularBooks = await Book.findAll({
        where: {
          availability: "available",
          rating: { [Op.gte]: 4.0 },
        },
        order: [
          ["rating", "DESC"],
          ["ratingsCount", "DESC"],
        ],
        limit: Number(limit),
      });

      res.json({
        success: true,
        data: {
          books: popularBooks,
          timeframe,
          fallbackToPopular: trendingBooks.length < Number(limit),
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          books: trendingBooks,
          timeframe,
        },
      });
    }
  } catch (error) {
    console.error("Trending recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get trending recommendations",
    });
  }
});

// Get recommendations for new users (no preferences yet)
router.get("/for-new-users", async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get a mix of popular books across different genres
    const popularBooks = await Book.findAll({
      where: {
        availability: "available",
        rating: { [Op.gte]: 4.0 },
      },
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
      ],
      limit: Number(limit),
    });

    // Group by genres to ensure diversity
    const genreGroups: { [key: string]: any[] } = {};
    popularBooks.forEach((book) => {
      book.categories.forEach((category) => {
        if (!genreGroups[category]) {
          genreGroups[category] = [];
        }
        if (genreGroups[category].length < 3) {
          // Max 3 books per genre
          genreGroups[category].push(book);
        }
      });
    });

    // Flatten and deduplicate
    const diverseBooks = new Map();
    Object.values(genreGroups).forEach((books) => {
      books.forEach((book) => {
        if (!diverseBooks.has(book.id)) {
          diverseBooks.set(book.id, book);
        }
      });
    });

    const recommendations = Array.from(diverseBooks.values()).slice(
      0,
      Number(limit)
    );

    res.json({
      success: true,
      data: {
        books: recommendations,
        message: "Curated selection for new readers",
      },
    });
  } catch (error) {
    console.error("New user recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get recommendations for new users",
    });
  }
});

// Get staff picks/editorial recommendations
router.get("/staff-picks", async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    // For demo purposes, we'll select highly-rated books with good descriptions
    const staffPicks = await Book.findAll({
      where: {
        availability: "available",
        rating: { [Op.gte]: 4.2 },
        description: { [Op.ne]: null },
      },
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
      ],
      limit: Number(limit),
    });

    // Add "staff pick" reasons using LLM
    const picksWithReasons = await Promise.all(
      staffPicks.map(async (book) => {
        try {
          const reason = await llmService.generateBookSummary(book);
          return {
            book,
            reason: `Staff Pick: ${reason}`,
            pickType: "editorial",
          };
        } catch (error) {
          return {
            book,
            reason: "Highly recommended by our editorial team",
            pickType: "editorial",
          };
        }
      })
    );

    res.json({
      success: true,
      data: picksWithReasons,
    });
  } catch (error) {
    console.error("Staff picks error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get staff picks",
    });
  }
});

// Get recommendations based on reading history (placeholder for future implementation)
router.get(
  "/based-on-history",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      // This would typically analyze user's purchase/reading history
      // For now, we'll return personalized recommendations
      const { limit = 10 } = req.query;

      const user = await User.findByPk(req.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Placeholder: return books similar to user's preferred genres
      const userGenres = user.preferences?.favoriteGenres || [];

      if (userGenres.length === 0) {
        return res.json({
          success: true,
          data: [],
          message:
            "No reading history available. Update your preferences to get better recommendations.",
        });
      }

      const historyBasedBooks = await Book.findAll({
        where: {
          categories: {
            [Op.overlap]: userGenres,
          },
          availability: "available",
        },
        order: [
          ["rating", "DESC"],
          ["ratingsCount", "DESC"],
        ],
        limit: Number(limit),
      });

      res.json({
        success: true,
        data: {
          books: historyBasedBooks,
          basedOnGenres: userGenres,
          message: "Based on your reading preferences",
        },
      });
    } catch (error) {
      console.error("History-based recommendations error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get history-based recommendations",
      });
    }
  }
);

export default router;
