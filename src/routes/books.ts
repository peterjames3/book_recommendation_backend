import express from "express";
import { Op } from "sequelize";
import { Book } from "../models/Book";
import { optionalAuth, AuthRequest } from "../middleware/auth";
import llmService from "../services/llmServices";

const router = express.Router();

// Get all books with pagination and filtering
router.get("/", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      genre,
      author,
      minRating,
      maxPrice,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const whereClause: any = {};

    // Apply filters
    if (genre) {
      whereClause.categories = {
        [Op.contains]: [genre],
      };
    }

    if (author) {
      whereClause.authors = {
        [Op.contains]: [author],
      };
    }

    if (minRating) {
      whereClause.rating = {
        [Op.gte]: Number(minRating),
      };
    }

    if (maxPrice) {
      whereClause.price = {
        [Op.lte]: Number(maxPrice),
      };
    }

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { authors: { [Op.contains]: [search as string] } },
        { categories: { [Op.contains]: [search as string] } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: books } = await Book.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset,
      order: [[sortBy as string, sortOrder as string]],
    });

    res.json({
      success: true,
      data: {
        books,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          totalItems: count,
          itemsPerPage: Number(limit),
          hasMore: offset + books.length < count,
        },
      },
    });
  } catch (error) {
    console.error("Get books error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// Get book by ID
router.get("/:id", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const book = await Book.findByPk(id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    // Get similar books
    const allBooks = await Book.findAll({ limit: 50 });
    const similarBooks = await llmService.findSimilarBooks(book, allBooks, 5);

    res.json({
      success: true,
      data: {
        book,
        similarBooks,
      },
    });
  } catch (error) {
    console.error("Get book error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

// Get featured/popular books
router.get("/featured/popular", async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const books = await Book.findAll({
      where: {
        rating: {
          [Op.gte]: 4.0,
        },
      },
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
      ],
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: books,
    });
  } catch (error) {
    console.error("Get featured books error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured books",
    });
  }
});

// Get books by genre
router.get("/genre/:genre", async (req, res) => {
  try {
    const { genre } = req.params;
    const { limit = 20, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows: books } = await Book.findAndCountAll({
      where: {
        categories: {
          [Op.contains]: [genre],
        },
      },
      limit: Number(limit),
      offset,
      order: [["rating", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        books,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          totalItems: count,
          itemsPerPage: Number(limit),
          hasMore: offset + books.length < count,
        },
      },
    });
  } catch (error) {
    console.error("Get books by genre error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch books by genre",
    });
  }
});

// Get new releases
router.get("/featured/new-releases", async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const books = await Book.findAll({
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: books,
    });
  } catch (error) {
    console.error("Get new releases error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch new releases",
    });
  }
});

// Get available genres
router.get("/meta/genres", async (req, res) => {
  try {
    const books = await Book.findAll({
      attributes: ["categories"],
    });

    const allGenres = new Set<string>();
    books.forEach((book) => {
      book.categories.forEach((category) => {
        allGenres.add(category);
      });
    });

    const genres = Array.from(allGenres).sort();

    res.json({
      success: true,
      data: genres,
    });
  } catch (error) {
    console.error("Get genres error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch genres",
    });
  }
});

// Get available authors
router.get("/meta/authors", async (req, res) => {
  try {
    const books = await Book.findAll({
      attributes: ["authors"],
    });

    const allAuthors = new Set<string>();
    books.forEach((book) => {
      book.authors.forEach((author) => {
        allAuthors.add(author);
      });
    });

    const authors = Array.from(allAuthors).sort();

    res.json({
      success: true,
      data: authors,
    });
  } catch (error) {
    console.error("Get authors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch authors",
    });
  }
});

export default router;
