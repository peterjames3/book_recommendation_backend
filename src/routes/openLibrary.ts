import express from "express";
import { Book } from "../models/Book";
import openLibraryService from "../services/openLibraryService";
import { body, validationResult } from "express-validator";

const router = express.Router();

// Search Open Library and optionally save books to database
router.post(
  "/search",
  [
    body("query").notEmpty().withMessage("Search query is required"),
    body("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    body("offset")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Offset must be non-negative"),
    body("saveToDatabase")
      .optional()
      .isBoolean()
      .withMessage("saveToDatabase must be boolean"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const {
        query,
        limit = 20,
        offset = 0,
        saveToDatabase = false,
      } = req.body;

      // Search Open Library
      const searchResults = await openLibraryService.searchBooks(
        query,
        Number(limit),
        Number(offset)
      );

      // Transform results to our format
      const transformedBooks = searchResults.docs.map((book) =>
        openLibraryService.transformToBook(book)
      );

      let savedBooks = [];

      if (saveToDatabase) {
        // Save books to database (avoid duplicates)
        for (const bookData of transformedBooks) {
          try {
            // Check if book already exists
            const existingBook = await Book.findOne({
              where: {
                openLibraryId: bookData.openLibraryId,
              },
            });

            if (!existingBook) {
              const savedBook = await Book.create(bookData);
              savedBooks.push(savedBook);
            } else {
              savedBooks.push(existingBook);
            }
          } catch (error) {
            console.error("Error saving book:", error);
            // Continue with other books even if one fails
          }
        }
      }

      res.json({
        success: true,
        data: {
          books: saveToDatabase ? savedBooks : transformedBooks,
          totalFound: searchResults.numFound,
          source: "Open Library",
          savedToDatabase: saveToDatabase,
          savedCount: savedBooks.length,
          pagination: {
            currentPage: Math.floor(Number(offset) / Number(limit)) + 1,
            totalPages: Math.ceil(searchResults.numFound / Number(limit)),
            totalItems: searchResults.numFound,
            itemsPerPage: Number(limit),
            hasMore:
              Number(offset) + transformedBooks.length < searchResults.numFound,
          },
        },
      });
    } catch (error) {
      console.error("Open Library search error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to search Open Library",
      });
    }
  }
);

// Get books by subject from Open Library
router.get("/subject/:subject", async (req, res) => {
  try {
    const { subject } = req.params;
    const { limit = 20, offset = 0, saveToDatabase = false } = req.query;

    const searchResults = await openLibraryService.searchBySubject(
      subject,
      Number(limit),
      Number(offset)
    );

    const transformedBooks = searchResults.docs.map((book) =>
      openLibraryService.transformToBook(book)
    );

    let savedBooks = [];

    if (saveToDatabase === "true") {
      for (const bookData of transformedBooks) {
        try {
          const existingBook = await Book.findOne({
            where: {
              openLibraryId: bookData.openLibraryId,
            },
          });

          if (!existingBook) {
            const savedBook = await Book.create(bookData);
            savedBooks.push(savedBook);
          } else {
            savedBooks.push(existingBook);
          }
        } catch (error) {
          console.error("Error saving book:", error);
        }
      }
    }

    res.json({
      success: true,
      data: {
        subject,
        books: saveToDatabase === "true" ? savedBooks : transformedBooks,
        totalFound: searchResults.numFound,
        source: "Open Library",
        savedToDatabase: saveToDatabase === "true",
        savedCount: savedBooks.length,
        pagination: {
          currentPage: Math.floor(Number(offset) / Number(limit)) + 1,
          totalPages: Math.ceil(searchResults.numFound / Number(limit)),
          totalItems: searchResults.numFound,
          itemsPerPage: Number(limit),
          hasMore:
            Number(offset) + transformedBooks.length < searchResults.numFound,
        },
      },
    });
  } catch (error) {
    console.error("Open Library subject search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search Open Library by subject",
    });
  }
});

// Get popular books from Open Library
router.get("/popular/:subject?", async (req, res) => {
  try {
    const { subject } = req.params;
    const { limit = 20, saveToDatabase = false } = req.query;

    const searchResults = await openLibraryService.getPopularBooks(
      subject,
      Number(limit)
    );

    const transformedBooks = searchResults.docs.map((book) =>
      openLibraryService.transformToBook(book)
    );

    let savedBooks = [];

    if (saveToDatabase === "true") {
      for (const bookData of transformedBooks) {
        try {
          const existingBook = await Book.findOne({
            where: {
              openLibraryId: bookData.openLibraryId,
            },
          });

          if (!existingBook) {
            const savedBook = await Book.create(bookData);
            savedBooks.push(savedBook);
          } else {
            savedBooks.push(existingBook);
          }
        } catch (error) {
          console.error("Error saving book:", error);
        }
      }
    }

    res.json({
      success: true,
      data: {
        books: saveToDatabase === "true" ? savedBooks : transformedBooks,
        subject: subject || "all",
        source: "Open Library",
        savedToDatabase: saveToDatabase === "true",
        savedCount: savedBooks.length,
      },
    });
  } catch (error) {
    console.error("Open Library popular books error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get popular books from Open Library",
    });
  }
});

// Get book details by Open Library key
router.get("/book/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { saveToDatabase = false } = req.query;

    const bookData = await openLibraryService.getBookByKey(key);
    const transformedBook = openLibraryService.transformToBook(bookData);

    let savedBook = null;

    if (saveToDatabase === "true") {
      try {
        const existingBook = await Book.findOne({
          where: {
            openLibraryId: transformedBook.openLibraryId,
          },
        });

        if (!existingBook) {
          savedBook = await Book.create(transformedBook);
        } else {
          savedBook = existingBook;
        }
      } catch (error) {
        console.error("Error saving book:", error);
      }
    }

    res.json({
      success: true,
      data: {
        book: saveToDatabase === "true" ? savedBook : transformedBook,
        source: "Open Library",
        savedToDatabase: saveToDatabase === "true",
      },
    });
  } catch (error) {
    console.error("Open Library book details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get book details from Open Library",
    });
  }
});

// Bulk import books from Open Library by subjects
router.post(
  "/bulk-import",
  [
    body("subjects").isArray().withMessage("Subjects must be an array"),
    body("booksPerSubject")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Books per subject must be between 1 and 50"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { subjects, booksPerSubject = 20 } = req.body;
      const importResults = [];
      let totalImported = 0;

      for (const subject of subjects) {
        try {
          const searchResults = await openLibraryService.searchBySubject(
            subject,
            Number(booksPerSubject)
          );

          const transformedBooks = searchResults.docs.map((book) =>
            openLibraryService.transformToBook(book)
          );

          let importedCount = 0;

          for (const bookData of transformedBooks) {
            try {
              const existingBook = await Book.findOne({
                where: {
                  openLibraryId: bookData.openLibraryId,
                },
              });

              if (!existingBook) {
                await Book.create(bookData);
                importedCount++;
                totalImported++;
              }
            } catch (error) {
              console.error(
                `Error importing book for subject ${subject}:`,
                error
              );
            }
          }

          importResults.push({
            subject,
            found: searchResults.docs.length,
            imported: importedCount,
          });

          // Add delay to avoid overwhelming the API
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error processing subject ${subject}:`, error);
          importResults.push({
            subject,
            found: 0,
            imported: 0,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        message: `Bulk import completed. ${totalImported} books imported.`,
        data: {
          totalImported,
          results: importResults,
        },
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to perform bulk import",
      });
    }
  }
);

export default router;
