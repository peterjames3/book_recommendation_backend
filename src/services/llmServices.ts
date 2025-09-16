import OpenAI from "openai";
import { Book } from "../models/Book";
import { User } from "../models/User";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  async parseNaturalLanguageQuery(query: string): Promise<SearchQuery> {
    try {
      const prompt = `
        Analyze this book search query and extract useful information for searching a book database:
        
        Query: "${query}"
        
        Please provide a JSON response with:
        1. extractedKeywords: Important keywords from the query
        2. suggestedGenres: Likely book genres based on the query
        3. searchTerms: Optimized search terms for book database search
        
        Example response:
        {
          "extractedKeywords": ["mystery", "detective", "crime"],
          "suggestedGenres": ["Mystery", "Crime", "Thriller"],
          "searchTerms": ["mystery detective", "crime thriller", "detective story"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a book search assistant. Analyze user queries and extract relevant search information. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const parsed = JSON.parse(content);

      return {
        originalQuery: query,
        extractedKeywords: parsed.extractedKeywords || [],
        suggestedGenres: parsed.suggestedGenres || [],
        searchTerms: parsed.searchTerms || [query],
      };
    } catch (error) {
      console.error("LLM query parsing error:", error);
      // Fallback to simple keyword extraction
      return {
        originalQuery: query,
        extractedKeywords: query.split(" ").filter((word) => word.length > 2),
        suggestedGenres: [],
        searchTerms: [query],
      };
    }
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

      const booksData = availableBooks.slice(0, 50).map((book) => ({
        id: book.id,
        title: book.title,
        authors: book.authors,
        categories: book.categories,
        description: book.description?.substring(0, 200) || "",
        rating: book.rating,
      }));

      const prompt = `
        Based on this user's preferences, recommend books from the available list:
        
        User Preferences:
        - Favorite Genres: ${
          userPreferences.favoriteGenres.join(", ") || "None specified"
        }
        - Preferred Authors: ${
          userPreferences.preferredAuthors.join(", ") || "None specified"
        }
        
        Available Books:
        ${JSON.stringify(booksData, null, 2)}
        
        Please provide recommendations as a JSON array with this format:
        [
          {
            "bookId": "book-id",
            "score": 0.95,
            "reason": "This book matches your interest in fantasy and has excellent ratings."
          }
        ]
        
        Provide up to ${limit} recommendations, scored from 0-1 based on relevance to user preferences.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a book recommendation expert. Analyze user preferences and recommend books with detailed reasoning. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.4,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const recommendations = JSON.parse(content);

      // Map recommendations to books and return
      const result: BookRecommendation[] = [];

      for (const rec of recommendations) {
        const book = availableBooks.find((b) => b.id === rec.bookId);
        if (book) {
          result.push({
            book,
            score: rec.score,
            reason: rec.reason,
          });
        }
      }

      return result.slice(0, limit);
    } catch (error) {
      console.error("LLM recommendation error:", error);

      // Fallback to simple genre-based recommendations
      const userGenres = user.preferences?.favoriteGenres || [];
      const fallbackRecommendations: BookRecommendation[] = [];

      for (const book of availableBooks.slice(0, limit)) {
        const genreMatch = book.categories.some((cat) =>
          userGenres.some((userGenre) =>
            cat.toLowerCase().includes(userGenre.toLowerCase())
          )
        );

        if (genreMatch || userGenres.length === 0) {
          fallbackRecommendations.push({
            book,
            score: genreMatch ? 0.8 : 0.5,
            reason: genreMatch
              ? `Matches your interest in ${book.categories.join(", ")}`
              : "Popular book you might enjoy",
          });
        }
      }

      return fallbackRecommendations.slice(0, limit);
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
        Create a compelling, concise summary for this book:
        
        Title: ${book.title}
        Authors: ${book.authors.join(", ")}
        Categories: ${book.categories.join(", ")}
        Description: ${book.description}
        
        Write a 2-3 sentence engaging summary that would help someone decide if they want to read this book.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a book reviewer who writes compelling, concise summaries that help readers discover great books.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.6,
        max_tokens: 150,
      });

      return (
        response.choices[0]?.message?.content ||
        book.description.substring(0, 200) + "..."
      );
    } catch (error) {
      console.error("LLM summary generation error:", error);
      return (
        book.description?.substring(0, 200) + "..." ||
        `${book.title} by ${book.authors.join(", ")}`
      );
    }
  }

  async findSimilarBooks(
    book: Book,
    availableBooks: Book[],
    limit: number = 5
  ): Promise<Book[]> {
    try {
      const booksData = availableBooks
        .filter((b) => b.id !== book.id)
        .slice(0, 30)
        .map((b) => ({
          id: b.id,
          title: b.title,
          authors: b.authors,
          categories: b.categories,
          description: b.description?.substring(0, 150) || "",
        }));

      const prompt = `
        Find books similar to this target book:
        
        Target Book:
        - Title: ${book.title}
        - Authors: ${book.authors.join(", ")}
        - Categories: ${book.categories.join(", ")}
        - Description: ${
          book.description?.substring(0, 200) || "No description"
        }
        
        Available Books:
        ${JSON.stringify(booksData, null, 2)}
        
        Return a JSON array of book IDs that are most similar to the target book, ordered by similarity:
        ["book-id-1", "book-id-2", "book-id-3"]
        
        Consider genre, themes, writing style, and subject matter. Return up to ${limit} book IDs.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a book similarity expert. Find books that readers would enjoy if they liked the target book. Always respond with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const similarBookIds = JSON.parse(content);
      const similarBooks: Book[] = [];

      for (const bookId of similarBookIds) {
        const similarBook = availableBooks.find((b) => b.id === bookId);
        if (similarBook) {
          similarBooks.push(similarBook);
        }
      }

      return similarBooks.slice(0, limit);
    } catch (error) {
      console.error("LLM similar books error:", error);

      // Fallback to category-based similarity
      return availableBooks
        .filter(
          (b) =>
            b.id !== book.id &&
            b.categories.some((cat) => book.categories.includes(cat))
        )
        .slice(0, limit);
    }
  }
}

export default new LLMService();
