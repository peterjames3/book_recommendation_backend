import axios from "axios";

const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";
const OPEN_LIBRARY_COVERS_URL = "https://covers.openlibrary.org/b";

export interface OpenLibraryBook {
  key: string;
  title: string;
  authors?: Array<{
    key: string;
    name: string;
  }>;
  isbn?: string[];
  isbn_13?: string[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: string[];
  description?: string | { value: string };
  covers?: number[];
  publishers?: string[];
  first_publish_date?: string;
  ratings_average?: number;
  ratings_count?: number;
}

export interface OpenLibrarySearchResult {
  docs: Array<{
    key: string;
    title: string;
    author_name?: string[];
    isbn?: string[];
    first_publish_year?: number;
    number_of_pages_median?: number;
    subject?: string[];
    cover_i?: number;
    ratings_average?: number;
    ratings_count?: number;
    publisher?: string[];
  }>;
  numFound: number;
  start: number;
}

class OpenLibraryService {
  private async makeRequest<T>(url: string): Promise<T> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "LitKenya-BookRecommendation/1.0",
        },
      });
      return response.data;
    } catch (error) {
      console.error("Open Library API error:", error);
      throw new Error("Failed to fetch data from Open Library");
    }
  }

  async searchBooks(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<OpenLibrarySearchResult> {
    const encodedQuery = encodeURIComponent(query);
    const url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodedQuery}&limit=${limit}&offset=${offset}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;

    return this.makeRequest<OpenLibrarySearchResult>(url);
  }

  async searchBySubject(
    subject: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<OpenLibrarySearchResult> {
    const encodedSubject = encodeURIComponent(subject);
    const url = `${OPEN_LIBRARY_BASE_URL}/subjects/${encodedSubject}.json?limit=${limit}&offset=${offset}`;

    return this.makeRequest<OpenLibrarySearchResult>(url);
  }

  async getBookByKey(key: string): Promise<OpenLibraryBook> {
    const cleanKey = key.startsWith("/works/") ? key : `/works/${key}`;
    const url = `${OPEN_LIBRARY_BASE_URL}${cleanKey}.json`;

    return this.makeRequest<OpenLibraryBook>(url);
  }

  async getBookByISBN(isbn: string): Promise<OpenLibraryBook> {
    const url = `${OPEN_LIBRARY_BASE_URL}/isbn/${isbn}.json`;

    return this.makeRequest<OpenLibraryBook>(url);
  }

  getCoverUrl(coverId: number, size: "S" | "M" | "L" = "M"): string {
    return `${OPEN_LIBRARY_COVERS_URL}/id/${coverId}-${size}.jpg`;
  }

  getCoverUrlByISBN(isbn: string, size: "S" | "M" | "L" = "M"): string {
    return `${OPEN_LIBRARY_COVERS_URL}/isbn/${isbn}-${size}.jpg`;
  }

  async getPopularBooks(
    subject?: string,
    limit: number = 20
  ): Promise<OpenLibrarySearchResult> {
    let url: string;

    if (subject) {
      const encodedSubject = encodeURIComponent(subject.toLowerCase());
      url = `${OPEN_LIBRARY_BASE_URL}/subjects/${encodedSubject}.json?limit=${limit}&sort=rating`;
    } else {
      // Get trending books by searching for recent popular titles
      url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=*&sort=rating&limit=${limit}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;
    }

    return this.makeRequest<OpenLibrarySearchResult>(url);
  }

  async getBooksByAuthor(
    authorName: string,
    limit: number = 20
  ): Promise<OpenLibrarySearchResult> {
    const encodedAuthor = encodeURIComponent(authorName);
    const url = `${OPEN_LIBRARY_BASE_URL}/search.json?author=${encodedAuthor}&limit=${limit}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;

    return this.makeRequest<OpenLibrarySearchResult>(url);
  }

  // Transform Open Library data to our Book format
  transformToBook(olBook: any, price?: number): any {
    const getDescription = (desc: any): string => {
      if (typeof desc === "string") return desc;
      if (desc && typeof desc === "object" && desc.value) return desc.value;
      return "";
    };

    const getCoverUrl = (book: any): string => {
      if (book.cover_i) {
        return this.getCoverUrl(book.cover_i, "L");
      }
      if (book.covers && book.covers.length > 0) {
        return this.getCoverUrl(book.covers[0], "L");
      }
      if (book.isbn && book.isbn.length > 0) {
        return this.getCoverUrlByISBN(book.isbn[0], "L");
      }
      return "";
    };

    return {
      openLibraryId: olBook.key,
      title: olBook.title || "",
      authors:
        olBook.author_name ||
        (olBook.authors ? olBook.authors.map((a: any) => a.name) : []),
      isbn: olBook.isbn ? olBook.isbn[0] : undefined,
      isbn13: olBook.isbn_13 ? olBook.isbn_13[0] : undefined,
      description: getDescription(olBook.description),
      publishedDate: olBook.first_publish_year
        ? olBook.first_publish_year.toString()
        : olBook.first_publish_date,
      pageCount: olBook.number_of_pages_median || olBook.number_of_pages,
      categories: olBook.subject ? olBook.subject.slice(0, 5) : [], // Limit to 5 categories
      imageUrl: getCoverUrl(olBook),
      rating: olBook.ratings_average
        ? Math.round(olBook.ratings_average * 10) / 10
        : undefined,
      ratingsCount: olBook.ratings_count || 0,
      price: price || Math.floor(Math.random() * 30) + 10, // Random price between $10-40
      availability: "available" as const,
    };
  }
}

export default new OpenLibraryService();
