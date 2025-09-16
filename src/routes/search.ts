import express from "express";
import { Op } from "sequelize";
import { Book } from "../models/Book";
import { optionalAuth, AuthRequest } from "../middleware/auth";
import llmService from "../services/llmService";
import openLibraryService from "../services/openLibraryService";

const router = express.Router();

// Natural language search with LLM enhancement
router.post("/natural", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { query, limit = 20, page = 1 } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // Parse the natural language query using LLM
    const parsedQuery = await llmService.parseNaturalLanguageQuery(query);

    const offset = (Number(page) - 1) * Number(limit);
    const searchConditions: any[] = [];

    // Build search conditions based on parsed query
    if (parsedQuery.searchTerms.length > 0) {
      parsedQuery.searchTerms.forEach((term) => {
        searchConditions.push({
          [Op.or]: [
            { title: { [Op.iLike]: `%${term}%` } },
            { authors: { [Op.contains]: [term] } },
            { description: { [Op.iLike]: `%${term}%` } },
          ],
        });
      });
    }

    // Add genre filters if suggested
    if (parsedQuery.suggestedGenres.length > 0) {
      searchConditions.push({
        categories: {
          [Op.overlap]: parsedQuery.suggestedGenres,
        },
      });
    }

    const whereClause =
      searchConditions.length > 0
        ? { [Op.or]: searchConditions }
        : {
            [Op.or]: [
              { title: { [Op.iLike]: `%${query}%` } },
              { authors: { [Op.contains]: [query] } },
              { description: { [Op.iLike]: `%${query}%` } },
            ],
          };

    const { count, rows: books } = await Book.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset,
      order: [
        ["rating", "DESC"],
        ["ratingsCount", "DESC"],
      ],
    });

    res.json({
      success: true,
      data: {
        books,
        parsedQuery,
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
    console.error("Natural language search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to perform natural language search",
    });
  }
});

// Advanced search with multiple filters
router.post("/advanced", optionalAuth, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      author,
      genres = [],
      minRating,
      maxRating,
      minPrice,
      maxPrice,
      publishedAfter,
      publishedBefore,
      minPages,
      maxPages,
      sortBy = "relevance",
      sortOrder = "desc",
      limit = 20,
      page = 1,
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);
    const whereClause: any = {};

    // Build where clause based on filters
    if (title) {
      whereClause.title = { [Op.iLike]: `%${title}%` };
    }

    if (author) {
      whereClause.authors = { [Op.contains]: [author] };
    }

    if (genres.length > 0) {
      whereClause.categories = { [Op.overlap]: genres };
    }

    if (minRating !== undefined) {
      whereClause.rating = {
        ...whereClause.rating,
        [Op.gte]: Number(minRating),
      };
    }

    if (maxRating !== undefined) {
      whereClause.rating = {
        ...whereClause.rating,
        [Op.lte]: Number(maxRating),
      };
    }

    if (minPrice !== undefined) {
      whereClause.price = { ...whereClause.price, [Op.gte]: Number(minPrice) };
    }

    if (maxPrice !== undefined) {
      whereClause.price = { ...whereClause.price, [Op.lte]: Number(maxPrice) };
    }

    if (publishedAfter) {
      whereClause.publishedDate = {
        ...whereClause.publishedDate,
        [Op.gte]: publishedAfter,
      };
    }

    if (publishedBefore) {
      whereClause.publishedDate = {
        ...whereClause.publishedDate,
        [Op.lte]: publishedBefore,
      };
    }

    if (minPages !== undefined) {
      whereClause.pageCount = {
        ...whereClause.pageCount,
        [Op.gte]: Number(minPages),
      };
    }

    if (maxPages !== undefined) {
      whereClause.pageCount = {
        ...whereClause.pageCount,
        [Op.lte]: Number(maxPages),
      };
    }

    // Determine sort order
    let orderClause: any[];
    switch (sortBy) {
      case "rating":
        orderClause = [["rating", sortOrder.toUpperCase()]];
        break;
      case "price":
        orderClause = [["price", sortOrder.toUpperCase()]];
        break;
      case "newest":
        orderClause = [["createdAt", "DESC"]];
        break;
      case "oldest":
        orderClause = [["createdAt", "ASC"]];
        break;
      case "title":
        orderClause = [["title", sortOrder.toUpperCase()]];
        break;
      default:
        orderClause = [
          ["rating", "DESC"],
          ["ratingsCount", "DESC"],
        ];
    }

    const { count, rows: books } = await Book.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset,
      order: orderClause,
    });

    res.json({
      success: true,
      data: {
        books,
        filters: {
          title,
          author,
          genres,
          minRating,
          maxRating,
          minPrice,
          maxPrice,
          publishedAfter,
          publishedBefore,
          minPages,
          maxPages,
          sortBy,
          sortOrder,
        },
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
    console.error("Advanced search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to perform advanced search",
    });
  }
});

// Search suggestions/autocomplete
router.get("/suggestions", async (req, res) => {
  try {
    const { q, type = "all", limit = 10 } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Query parameter is required",
      });
    }

    const suggestions: any = {
      titles: [],
      authors: [],
      genres: [],
    };

    if (type === "all" || type === "titles") {
      const titleBooks = await Book.findAll({
        where: {
          title: { [Op.iLike]: `%${q}%` },
        },
        attributes: ["title"],
        limit: Number(limit),
        order: [["rating", "DESC"]],
      });
      suggestions.titles = titleBooks.map((book) => book.title);
    }

    if (type === "all" || type === "authors") {
      const authorBooks = await Book.findAll({
        where: {
          authors: { [Op.contains]: [q as string] },
        },
        attributes: ["authors"],
        limit: Number(limit),
      });

      const authorSet = new Set<string>();
      authorBooks.forEach((book) => {
        book.authors.forEach((author) => {
          if (author.toLowerCase().includes((q as string).toLowerCase())) {
            authorSet.add(author);
          }
        });
      });
      suggestions.authors = Array.from(authorSet).slice(0, Number(limit));
    }

    if (type === "all" || type === "genres") {
      const genreBooks = await Book.findAll({
        attributes: ["categories"],
      });

      const genreSet = new Set<string>();
      genreBooks.forEach((book) => {
        book.categories.forEach((category) => {
          if (category.toLowerCase().includes((q as string).toLowerCase())) {
            genreSet.add(category);
          }
        });
      });
      suggestions.genres = Array.from(genreSet).slice(0, Number(limit));
    }

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error("Search suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get search suggestions",
    });
  }
});

// Search external sources (Open Library)
router.post("/external", async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // Search Open Library
    const openLibraryResults = await openLibraryService.searchBooks(
      query,
      Number(limit),
      Number(offset)
    );

    // Transform results to our format
    const transformedBooks = openLibraryResults.docs.map((book) =>
      openLibraryService.transformToBook(book)
    );

    res.json({
      success: true,
      data: {
        books: transformedBooks,
        totalFound: openLibraryResults.numFound,
        source: "Open Library",
        pagination: {
          currentPage: Math.floor(Number(offset) / Number(limit)) + 1,
          totalPages: Math.ceil(openLibraryResults.numFound / Number(limit)),
          totalItems: openLibraryResults.numFound,
          itemsPerPage: Number(limit),
          hasMore:
            Number(offset) + transformedBooks.length <
            openLibraryResults.numFound,
        },
      },
    });
  } catch (error) {
    console.error("External search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search external sources",
    });
  }
});

export default router;
