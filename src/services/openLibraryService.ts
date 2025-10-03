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
  description?: string | { value: string } | { type: string; value: string };
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

export interface OpenLibrarySubjectResult {
  key: string;
  name: string;
  work_count: number;
  works: Array<{
    key: string;
    title: string;
    authors: Array<{ key: string; name: string }>;
    cover_id?: number;
    first_publish_year?: number;
    availability?: {
      status: string;
      available_to_borrow?: boolean;
      available_to_waitlist?: boolean;
    };
  }>;
}

class OpenLibraryService {
  private async makeRequest<T>(url: string): Promise<T> {
    try {
      console.log(`🌐 Making request to: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "LitKenya-BookRecommendation/1.0",
        },
      });

      // Log response structure for debugging
      console.log(`📥 Response keys: ${Object.keys(response.data).join(", ")}`);
      if (response.data.docs) {
        console.log(`📚 Found ${response.data.docs.length} docs`);
      }
      if (response.data.works) {
        console.log(`📚 Found ${response.data.works.length} works`);
      }

      return response.data;
    } catch (error) {
      console.error("Open Library API error:", error);
      if (axios.isAxiosError(error)) {
        console.error(`Status: ${error.response?.status}`);
        console.error(`Response: ${JSON.stringify(error.response?.data)}`);
      }
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
  ): Promise<OpenLibrarySubjectResult> {
    const encodedSubject = encodeURIComponent(subject);
    const url = `${OPEN_LIBRARY_BASE_URL}/subjects/${encodedSubject}.json?limit=${limit}&offset=${offset}`;

    return this.makeRequest<OpenLibrarySubjectResult>(url);
  }

  async searchBooksBySubject(
    subject: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<OpenLibrarySearchResult> {
    const encodedSubject = encodeURIComponent(`subject:"${subject}"`);
    const url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodedSubject}&limit=${limit}&offset=${offset}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;

    return this.makeRequest<OpenLibrarySearchResult>(url);
  }

  async getBookByKey(key: string): Promise<OpenLibraryBook> {
    const cleanKey = key.startsWith("/works/") ? key : `/works/${key}`;
    const url = `${OPEN_LIBRARY_BASE_URL}${cleanKey}.json`;

    const book = await this.makeRequest<OpenLibraryBook>(url);

    // Debug description format
    this.debugDescription(book.description, cleanKey);

    return book;
  }

  async getBookByISBN(isbn: string): Promise<OpenLibraryBook> {
    const url = `${OPEN_LIBRARY_BASE_URL}/isbn/${isbn}.json`;

    const book = await this.makeRequest<OpenLibraryBook>(url);

    // Debug description format
    this.debugDescription(book.description, `ISBN:${isbn}`);

    return book;
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
      const encodedSubject = encodeURIComponent(`subject:"${subject}"`);
      url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodedSubject}&sort=rating+desc&limit=${limit}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;
    } else {
      url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=*&sort=rating+desc&limit=${limit}&fields=key,title,author_name,isbn,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count,publisher`;
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

  // Enhanced description handling methods
  async getBookDescription(workKey: string): Promise<string> {
    try {
      const cleanKey = workKey.startsWith("/works/")
        ? workKey
        : `/works/${workKey}`;
      const url = `${OPEN_LIBRARY_BASE_URL}${cleanKey}.json`;
      const response = await axios.get(url);

      const description = response.data.description;
      return this.extractDescription(description);
    } catch (error) {
      console.error(`Failed to fetch description for ${workKey}:`, error);
      return "No description available";
    }
  }

  private extractDescription(desc: any): string {
    if (!desc) return "No description available";

    if (typeof desc === "string") {
      return desc.replace(/<\/?[^>]+(>|$)/g, "").trim();
    }

    if (typeof desc === "object") {
      if (desc.value) return desc.value;
      if (desc.type === "/type/text" && desc.value) return desc.value;
      if (typeof desc === "object" && !Array.isArray(desc)) {
        // Try to find any string value in the object
        for (const key in desc) {
          if (typeof desc[key] === "string" && desc[key].length > 10) {
            return desc[key];
          }
        }
      }
    }

    return "No description available";
  }

  // Enhanced search with descriptions
  async searchBooksWithDescriptions(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    const searchResult = await this.searchBooks(query, limit, offset);

    // Fetch detailed information for each book to get descriptions
    const booksWithDescriptions = await Promise.all(
      searchResult.docs.map(async (doc) => {
        try {
          const fullBook = await this.getBookByKey(doc.key);
          return this.transformToBook({
            ...doc,
            description: fullBook.description || "No description available",
          });
        } catch (error) {
          console.error(`Failed to fetch details for ${doc.key}:`, error);
          return this.transformToBook(doc);
        }
      })
    );

    return booksWithDescriptions;
  }

  // Alternative description sources
  async getBookDescriptionFromISBN(isbn: string): Promise<string> {
    try {
      // Try Google Books API as fallback
      const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
      const response = await axios.get(googleBooksUrl);

      if (response.data.items && response.data.items.length > 0) {
        const description = response.data.items[0].volumeInfo.description;
        return description || "No description available";
      }
    } catch (error) {
      console.error(
        `Failed to fetch description from Google Books for ISBN ${isbn}:`,
        error
      );
    }

    return "No description available";
  }

  // Debugging helper
  private debugDescription(desc: any, key: string): void {
    console.log(`🔍 Description debug for ${key}:`);
    console.log(`   Type: ${typeof desc}`);
    console.log(`   Value:`, desc);

    if (desc && typeof desc === "object") {
      console.log(`   Object keys: ${Object.keys(desc).join(", ")}`);
      console.log(`   Is array: ${Array.isArray(desc)}`);
    }
  }

  // Transform Open Library data to our Book format
  transformToBook(olBook: any, price?: number): any {
    const getDescription = (desc: any): string => {
      return this.extractDescription(desc);
    };

    const getCoverUrl = (book: any): string => {
      if (book.cover_i) {
        return this.getCoverUrl(book.cover_i, "L");
      }
      if (book.cover_id) {
        return this.getCoverUrl(book.cover_id, "L");
      }
      if (book.covers && book.covers.length > 0) {
        return this.getCoverUrl(book.covers[0], "L");
      }
      if (book.isbn && book.isbn.length > 0) {
        return this.getCoverUrlByISBN(book.isbn[0], "L");
      }
      return "";
    };

    const getAuthors = (book: any): string[] => {
      if (book.author_name) {
        return book.author_name;
      }
      if (book.authors) {
        return book.authors.map((a: any) => a.name);
      }
      return [];
    };

    const getTitle = (book: any): string => {
      return book.title || "Unknown Title";
    };

    const getPublishYear = (book: any): number | undefined => {
      return book.first_publish_year;
    };

    const getKey = (book: any): string => {
      return book.key || "";
    };

    return {
      openLibraryId: getKey(olBook),
      title: getTitle(olBook),
      authors: getAuthors(olBook),
      isbn: olBook.isbn ? olBook.isbn[0] : undefined,
      isbn13: olBook.isbn_13 ? olBook.isbn_13[0] : undefined,
      description: getDescription(olBook.description),
      publishedDate: getPublishYear(olBook)
        ? getPublishYear(olBook)!.toString()
        : undefined,
      pageCount: olBook.number_of_pages_median || olBook.number_of_pages,
      categories: olBook.subject ? olBook.subject.slice(0, 5) : [],
      imageUrl: getCoverUrl(olBook),
      rating: olBook.ratings_average
        ? Math.round(olBook.ratings_average * 10) / 10
        : undefined,
      ratingsCount: olBook.ratings_count || 0,
      price: price || Math.floor(Math.random() * 30) + 10,
      availability: "available" as const,
    };
  }
}

export default new OpenLibraryService();
