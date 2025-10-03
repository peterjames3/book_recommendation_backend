import express from "express";
import { Op } from "sequelize";
import { Book } from "../models/Book.ts";
import { optionalAuth, AuthRequest } from "../middleware/auth.ts";
import llmService from "../services/llmServices.ts";
import openLibraryService from "../services/openLibraryService.ts";

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

// Enhanced search with Open Library integration
router.get("/search/enhanced", async (req: AuthRequest, res) => {
  try {
    const { q, limit = 20, includeDescriptions = "true" } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'q' is required",
      });
    }

    let books;
    if (includeDescriptions === "true") {
      books = await openLibraryService.searchBooksWithDescriptions(
        q as string,
        Number(limit)
      );
    } else {
      const searchResult = await openLibraryService.searchBooks(
        q as string,
        Number(limit)
      );
      books = searchResult.docs.map((doc) =>
        openLibraryService.transformToBook(doc)
      );
    }

    res.json({
      success: true,
      data: books,
    });
  } catch (error) {
    console.error("Enhanced search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search books",
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

// Get book description from Open Library
router.get("/:id/description", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // If it's an Open Library ID
    if (id.startsWith("OL") || id.startsWith("/works/")) {
      const description = await openLibraryService.getBookDescription(id);
      return res.json({
        success: true,
        data: { description },
      });
    }

    // If it's our internal ID, get the Open Library ID first
    const book = await Book.findByPk(id);
    if (!book || !book.openLibraryId) {
      return res.status(404).json({
        success: false,
        message: "Book not found or no Open Library ID available",
      });
    }

    const description = await openLibraryService.getBookDescription(
      book.openLibraryId
    );
    res.json({
      success: true,
      data: { description },
    });
  } catch (error) {
    console.error("Get book description error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch book description",
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
