// services/llmService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Book } from "../models/Book";
import { User } from "../models/User";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface BookRecommendation {
  book: Book;
  score: number;
  reason: string;
}

export interface SearchQuery {
  originalQuery: string;
  extractedKeywords: string[];
  suggestedGenres: string[];
  searchTerms: string[];
}

class LLMService {
  private model: any;

  constructor() {
    // Use the working model from your test
    this.model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Use the same model that worked in your test
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
    });
    console.log("✅ LLM Service initialized with gemini-1.5-flash");
  }

  private async generateContent(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error("Gemini API error:", error);
      throw error;
    }
  }

  async parseNaturalLanguageQuery(query: string): Promise<SearchQuery> {
    try {
      const prompt = `
      You are a book search expert. Analyze the user's book search query and extract structured information for database search.

      QUERY: "${query}"

      Extract and return as valid JSON:
      {
        "extractedKeywords": ["keyword1", "keyword2", ...],
        "suggestedGenres": ["Genre1", "Genre2", ...],
        "searchTerms": ["search term 1", "search term 2", ...]
      }

      Guidelines:
      - extractedKeywords: Important nouns, themes, or specific terms from the query
      - suggestedGenres: Likely book genres/categories (e.g., Fantasy, Mystery, Romance, Science Fiction)
      - searchTerms: Optimized phrases for book database search

      Example for "fantasy books with dragons and magic":
      {
        "extractedKeywords": ["fantasy", "dragons", "magic", "wizards"],
        "suggestedGenres": ["Fantasy", "Young Adult", "Epic Fantasy"],
        "searchTerms": ["fantasy dragons", "magic fantasy", "epic fantasy with dragons"]
      }

      Respond with ONLY the JSON object, no additional text.
      `;

      const content = await this.generateContent(prompt);

      // Clean the response and parse JSON
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanContent);

      return {
        originalQuery: query,
        extractedKeywords: parsed.extractedKeywords || [],
        suggestedGenres: parsed.suggestedGenres || [],
        searchTerms: parsed.searchTerms || [query],
      };
    } catch (error) {
      console.error("LLM query parsing error:", error);
      // Fallback to simple parsing
      return this.fallbackQueryParse(query);
    }
  }

  private fallbackQueryParse(query: string): SearchQuery {
    console.log("Using fallback query parsing");

    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "about",
    ]);
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);

    const genreMap: { [key: string]: string[] } = {
      fantasy: [
        "fantasy",
        "magic",
        "dragon",
        "wizard",
        "elf",
        "orc",
        "kingdom",
        "mythical",
      ],
      mystery: [
        "mystery",
        "crime",
        "detective",
        "thriller",
        "suspense",
        "murder",
        "investigation",
      ],
      romance: [
        "romance",
        "love",
        "relationship",
        "dating",
        "marriage",
        "heart",
        "passion",
      ],
      scifi: [
        "sci-fi",
        "science fiction",
        "space",
        "alien",
        "future",
        "robot",
        "technology",
        "galaxy",
      ],
      horror: [
        "horror",
        "scary",
        "ghost",
        "supernatural",
        "zombie",
        "vampire",
        "haunted",
      ],
      historical: [
        "historical",
        "history",
        "period",
        "ancient",
        "medieval",
        "victorian",
        "world war",
      ],
      biography: [
        "biography",
        "memoir",
        "autobiography",
        "life story",
        "true story",
      ],
    };

    const detectedGenres: string[] = [];
    for (const [genre, terms] of Object.entries(genreMap)) {
      if (terms.some((term) => query.toLowerCase().includes(term))) {
        detectedGenres.push(genre.charAt(0).toUpperCase() + genre.slice(1));
      }
    }

    return {
      originalQuery: query,
      extractedKeywords: keywords,
      suggestedGenres: detectedGenres,
      searchTerms: [query, ...keywords.slice(0, 3)].filter(Boolean),
    };
  }

  async generatePersonalizedRecommendations(
    user: User,
    availableBooks: Book[],
    limit: number = 10
  ): Promise<BookRecommendation[]> {
    try {
      const userPreferences = user.preferences || {
        favoriteGenres: [],
        preferredAuthors: [],
      };

      // Prepare book data for the prompt
      const booksData = availableBooks.slice(0, 50).map((book) => ({
        id: book.id,
        title: book.title,
        authors: book.authors,
        categories: book.categories,
        description: book.description?.substring(0, 150) || "",
        rating: book.rating || 0,
      }));

      const prompt = `
      You are a book recommendation expert. Recommend books based on user preferences.

      USER PREFERENCES:
      - Favorite Genres: ${
        userPreferences.favoriteGenres.join(", ") || "None specified"
      }
      - Preferred Authors: ${
        userPreferences.preferredAuthors.join(", ") || "None specified"
      }

      AVAILABLE BOOKS (first 50):
      ${JSON.stringify(booksData, null, 2)}

      Provide recommendations as a JSON array with this exact format:
      [
        {
          "bookId": "exact-book-id-from-list",
          "score": 0.95,
          "reason": "Detailed explanation why this book matches user preferences"
        }
      ]

      Guidelines:
      - Score should be between 0.5 and 1.0
      - Only recommend books from the available list
      - Focus on genre and author matches
      - Consider book ratings if available
      - Return maximum ${limit} recommendations

      Respond with ONLY the JSON array, no additional text.
      `;

      const content = await this.generateContent(prompt);
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      const recommendations = JSON.parse(cleanContent);

      const result: BookRecommendation[] = [];

      for (const rec of recommendations.slice(0, limit)) {
        const book = availableBooks.find((b) => b.id === rec.bookId);
        if (book) {
          result.push({
            book,
            score: Math.min(Math.max(rec.score || 0.5, 0), 1),
            reason: rec.reason || "Recommended based on your preferences",
          });
        }
      }

      return result;
    } catch (error) {
      console.error("LLM recommendation error:", error);
      return this.fallbackRecommendations(user, availableBooks, limit);
    }
  }

  private fallbackRecommendations(
    user: User,
    availableBooks: Book[],
    limit: number = 10
  ): BookRecommendation[] {
    const userGenres = user.preferences?.favoriteGenres || [];
    const userAuthors = user.preferences?.preferredAuthors || [];

    const scoredBooks = availableBooks.map((book) => {
      let score = 0.3; // Base score

      // Genre matching
      const genreMatch = book.categories.some((cat) =>
        userGenres.some((userGenre) =>
          cat.toLowerCase().includes(userGenre.toLowerCase())
        )
      );
      if (genreMatch) score += 0.4;

      // Author matching
      const authorMatch = book.authors.some((author) =>
        userAuthors.some((userAuthor) =>
          author.toLowerCase().includes(userAuthor.toLowerCase())
        )
      );
      if (authorMatch) score += 0.3;

      // Rating boost
      if (book.rating && book.rating > 4) score += 0.1;

      return { book, score };
    });

    return scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ book, score }) => ({
        book,
        score,
        reason: this.generateFallbackReason(book, userGenres, userAuthors),
      }));
  }

  private generateFallbackReason(
    book: Book,
    userGenres: string[],
    userAuthors: string[]
  ): string {
    const genreMatch = book.categories.some((cat) =>
      userGenres.some((userGenre) =>
        cat.toLowerCase().includes(userGenre.toLowerCase())
      )
    );

    const authorMatch = book.authors.some((author) =>
      userAuthors.some((userAuthor) =>
        author.toLowerCase().includes(userAuthor.toLowerCase())
      )
    );

    if (genreMatch && authorMatch) {
      return `Matches your favorite genres and authors`;
    } else if (genreMatch) {
      return `Matches your interest in ${book.categories.join(", ")}`;
    } else if (authorMatch) {
      return `By an author you enjoy`;
    } else {
      return "Popular book you might enjoy";
    }
  }

  async generateBookSummary(book: Book): Promise<string> {
    try {
      if (!book.description) {
        return `${book.title} by ${book.authors.join(
          ", "
        )} - A ${book.categories.join(", ")} book.`;
      }

      const prompt = `
      Create a compelling 2-3 sentence summary for this book that will help readers decide if they want to read it.

      BOOK INFORMATION:
      - Title: ${book.title}
      - Author(s): ${book.authors.join(", ")}
      - Categories: ${book.categories.join(", ")}
      - Description: ${book.description}

      Write an engaging summary that captures the essence of the book without spoilers.
      Focus on what makes the book interesting and who would enjoy it.
      `;

      const content = await this.generateContent(prompt);
      return content.trim();
    } catch (error) {
      console.error("LLM summary generation error:", error);
      return (
        book.description?.substring(0, 200) + "..." ||
        `${book.title} by ${book.authors.join(", ")} - ${book.categories.join(
          ", "
        )}`
      );
    }
  }

  async findSimilarBooks(
    targetBook: Book,
    availableBooks: Book[],
    limit: number = 5
  ): Promise<BookRecommendation[]> {
    try {
      // Prepare book data for the prompt
      const booksData = availableBooks.slice(0, 30).map((book) => ({
        id: book.id,
        title: book.title,
        authors: book.authors,
        categories: book.categories,
        description: book.description?.substring(0, 150) || "",
        rating: book.rating || 0,
      }));

      const prompt = `
      You are a book recommendation expert. Find books similar to the target book based on genre, themes, writing style, and content.

      TARGET BOOK:
      - Title: ${targetBook.title}
      - Authors: ${targetBook.authors.join(", ")}
      - Categories: ${targetBook.categories.join(", ")}
      - Description: ${targetBook.description?.substring(0, 200) || "No description available"}

      AVAILABLE BOOKS TO CHOOSE FROM:
      ${JSON.stringify(booksData, null, 2)}

      Find the most similar books and provide recommendations as a JSON array with this exact format:
      [
        {
          "bookId": "exact-book-id-from-list",
          "score": 0.95,
          "reason": "Detailed explanation of why this book is similar to the target book"
        }
      ]

      Guidelines:
      - Score should be between 0.6 and 1.0 (only recommend truly similar books)
      - Only recommend books from the available list
      - Focus on genre, themes, writing style, and content similarities
      - Consider author style if relevant
      - Return maximum ${limit} recommendations
      - Order by similarity score (highest first)

      Respond with ONLY the JSON array, no additional text.
      `;

      const content = await this.generateContent(prompt);
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      const recommendations = JSON.parse(cleanContent);

      const result: BookRecommendation[] = [];

      for (const rec of recommendations.slice(0, limit)) {
        const book = availableBooks.find((b) => b.id === rec.bookId);
        if (book) {
          result.push({
            book,
            score: Math.min(Math.max(rec.score || 0.6, 0), 1),
            reason: rec.reason || "Similar themes and genre",
          });
        }
      }

      return result;
    } catch (error) {
      console.error("LLM similar books error:", error);
      return this.fallbackSimilarBooks(targetBook, availableBooks, limit);
    }
  }

  private fallbackSimilarBooks(
    targetBook: Book,
    availableBooks: Book[],
    limit: number = 5
  ): BookRecommendation[] {
    const scoredBooks = availableBooks.map((book) => {
      let score = 0.1; // Base score

      // Genre matching (most important)
      const genreMatches = book.categories.filter((cat) =>
        targetBook.categories.some((targetCat) =>
          cat.toLowerCase().includes(targetCat.toLowerCase()) ||
          targetCat.toLowerCase().includes(cat.toLowerCase())
        )
      );
      score += genreMatches.length * 0.3;

      // Author matching
      const authorMatches = book.authors.filter((author) =>
        targetBook.authors.some((targetAuthor) =>
          author.toLowerCase().includes(targetAuthor.toLowerCase()) ||
          targetAuthor.toLowerCase().includes(author.toLowerCase())
        )
      );
      score += authorMatches.length * 0.2;

      // Description similarity (basic keyword matching)
      if (book.description && targetBook.description) {
        const bookWords = book.description.toLowerCase().split(/\s+/);
        const targetWords = targetBook.description.toLowerCase().split(/\s+/);
        const commonWords = bookWords.filter((word) =>
          targetWords.includes(word) && word.length > 3
        );
        score += Math.min(commonWords.length * 0.05, 0.2);
      }

      // Rating similarity bonus
      if (book.rating && targetBook.rating) {
        const ratingDiff = Math.abs(book.rating - targetBook.rating);
        if (ratingDiff < 0.5) score += 0.1;
      }

      return { book, score };
    });

    return scoredBooks
      .filter(({ score }) => score > 0.3) // Only return reasonably similar books
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ book, score }) => ({
        book,
        score,
        reason: this.generateSimilarityReason(book, targetBook),
      }));
  }

  private generateSimilarityReason(book: Book, targetBook: Book): string {
    const genreMatches = book.categories.filter((cat) =>
      targetBook.categories.some((targetCat) =>
        cat.toLowerCase().includes(targetCat.toLowerCase())
      )
    );

    const authorMatches = book.authors.filter((author) =>
      targetBook.authors.some((targetAuthor) =>
        author.toLowerCase().includes(targetAuthor.toLowerCase())
      )
    );

    if (genreMatches.length > 0 && authorMatches.length > 0) {
      return `Similar genre (${genreMatches.join(", ")}) and author style`;
    } else if (genreMatches.length > 0) {
      return `Similar genre: ${genreMatches.join(", ")}`;
    } else if (authorMatches.length > 0) {
      return `Same author or similar writing style`;
    } else {
      return "Similar themes and content";
    }
  }
}

export default new LLMService();
