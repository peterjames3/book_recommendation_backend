// src/scripts/populateFromOpenLibrary.ts
import "reflect-metadata";
import { initializeDatabase } from "../config/database";
import { Book } from "../models/Book";
import openLibraryService from "../services/openLibraryService";

// All 29 categories
const CATEGORIES = [
  "Art",
  "Biography",
  "Business",
  "Children",
  "Classics",
  "Comic",
  "Contemporary",
  "Cookbooks",
  "Crime",
  "Fantasy",
  "Fiction",
  "Historical Fiction",
  "History",
  "Horror",
  "Humor",
  "Mystery",
  "Nonfiction",
  "Philosophy",
  "Poetry",
  "Psychology",
  "Religion",
  "Romance",
  "Science",
  "Science Fiction",
  "Self Help",
  "Sports",
  "Thriller",
  "Travel",
  "Young Adult",
];

const CATEGORY_TO_SUBJECT: { [key: string]: string[] } = {
  Art: ["art", "art history"],
  Biography: ["biography", "autobiography"],
  Business: ["business", "economics"],
  Children: ["children", "children's literature"],
  Classics: ["classics", "classic literature"],
  Comic: ["comics", "graphic novels"],
  Contemporary: ["contemporary", "modern fiction"],
  Cookbooks: ["cooking", "cookbooks"],
  Crime: ["crime", "crime fiction"],
  Fantasy: ["fantasy"],
  Fiction: ["fiction"],
  "Historical Fiction": ["historical fiction"],
  History: ["history"],
  Horror: ["horror"],
  Humor: ["humor", "comedy"],
  Mystery: ["mystery"],
  Nonfiction: ["nonfiction"],
  Philosophy: ["philosophy"],
  Poetry: ["poetry"],
  Psychology: ["psychology"],
  Religion: ["religion", "spirituality"],
  Romance: ["romance"],
  Science: ["science"],
  "Science Fiction": ["science fiction"],
  "Self Help": ["self help", "self-improvement"],
  Sports: ["sports"],
  Thriller: ["thriller", "suspense"],
  Travel: ["travel"],
  "Young Adult": ["young adult", "teen fiction"],
};

const BOOKS_PER_CATEGORY = 15;
const DELAY_BETWEEN_REQUESTS = 1500;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testOpenLibraryService(): Promise<boolean> {
  console.log("🧪 Testing Open Library service...");
  try {
    const testResults = await openLibraryService.searchBooks("harry potter", 3);
    console.log("✅ Open Library service is working");
    return true;
  } catch (error) {
    console.error("❌ Open Library service test failed:", error);
    return false;
  }
}

// Fix the data transformation to match your Book model
function safeTransformBook(bookData: any, category: string) {
  const transformed = openLibraryService.transformToBook(bookData);

  // Ensure authors is always an array of strings
  if (!Array.isArray(transformed.authors)) {
    transformed.authors = transformed.authors
      ? [transformed.authors]
      : ["Unknown Author"];
  }

  // FIX: categories should be array of strings, not object
  transformed.categories = [category]; // Array with the category string

  // Set default price if missing
  if (!transformed.price) {
    transformed.price = Math.random() * 30 + 10;
  }

  // Set availability
  transformed.availability = "available";

  // Ensure rating is a number between 0-5
  if (
    transformed.rating &&
    (transformed.rating < 0 || transformed.rating > 5)
  ) {
    transformed.rating = Math.min(5, Math.max(0, transformed.rating));
  }

  return transformed;
}

async function searchBooksForCategory(category: string): Promise<any[]> {
  const subjects = CATEGORY_TO_SUBJECT[category] || [category.toLowerCase()];
  const allBooks: any[] = [];

  for (const subject of subjects) {
    try {
      console.log(`   🔍 Searching for "${subject}"...`);
      const searchResults = await openLibraryService.searchBooksBySubject(
        subject,
        50, // Get more books to have better selection
        0
      );

      if (searchResults.docs && searchResults.docs.length > 0) {
        // Filter out books without essential information
        const validBooks = searchResults.docs.filter(
          (book) =>
            book.title &&
            book.author_name &&
            book.author_name.length > 0 &&
            !book.title.toLowerCase().includes("guide to") &&
            !book.title.toLowerCase().includes("dictionary") &&
            !book.title.toLowerCase().includes("encyclopedia")
        );

        allBooks.push(...validBooks);
        console.log(
          `   📚 Found ${validBooks.length} valid books for "${subject}"`
        );
      }

      await delay(1000); // Be nice to the API
    } catch (error) {
      console.error(`   ❌ Error searching for "${subject}":`, error);
    }
  }

  return allBooks;
}

async function populateBooks(): Promise<void> {
  console.log("🚀 Starting book population from Open Library...");
  console.log(`📚 Categories to process: ${CATEGORIES.length}`);

  const isServiceWorking = await testOpenLibraryService();
  if (!isServiceWorking) {
    console.log("❌ Cannot proceed - Open Library service not working");
    return;
  }

  let totalImported = 0;
  const results: Array<{
    category: string;
    imported: number;
    errors: number;
  }> = [];

  for (const category of CATEGORIES) {
    console.log(`\n🎯 Processing category: ${category}`);

    let imported = 0;
    let errors = 0;
    const uniqueBooks = new Set<string>();

    try {
      const booksData = await searchBooksForCategory(category);

      if (booksData.length === 0) {
        console.log(`   ⚠️  No books found for category: ${category}`);
        results.push({ category, imported: 0, errors: 0 });
        continue;
      }

      console.log(`   📖 Processing ${booksData.length} potential books...`);

      // Shuffle and take up to BOOKS_PER_CATEGORY
      const shuffledBooks = booksData.sort(() => 0.5 - Math.random());
      const selectedBooks = shuffledBooks.slice(0, BOOKS_PER_CATEGORY);

      for (const bookData of selectedBooks) {
        if (imported >= BOOKS_PER_CATEGORY) break;

        const bookKey = bookData.key || bookData.isbn?.[0];
        if (!bookKey || uniqueBooks.has(bookKey)) {
          continue;
        }

        try {
          // Use the safe transform function
          const transformedBook = safeTransformBook(bookData, category);

          console.log(`   📘 Processing: "${transformedBook.title}"`);
          console.log(`      Authors:`, transformedBook.authors);
          console.log(`      Categories:`, transformedBook.categories);

          const existingBook = await Book.findOne({
            where: { openLibraryId: transformedBook.openLibraryId },
          });

          if (!existingBook) {
            // Create the book with data types that match your model
            const bookToCreate = {
              openLibraryId: transformedBook.openLibraryId,
              title: transformedBook.title,
              authors: transformedBook.authors, // Array of strings
              isbn: transformedBook.isbn,
              isbn13: transformedBook.isbn13,
              description: transformedBook.description,
              publishedDate: transformedBook.publishedDate,
              pageCount: transformedBook.pageCount,
              categories: transformedBook.categories, // Array of strings
              imageUrl: transformedBook.imageUrl,
              rating: transformedBook.rating
                ? parseFloat(transformedBook.rating.toString())
                : null,
              ratingsCount: transformedBook.ratingsCount || 0,
              price: transformedBook.price
                ? parseFloat(transformedBook.price.toString())
                : null,
              availability: transformedBook.availability,
            };

            await Book.create(bookToCreate);
            imported++;
            totalImported++;
            uniqueBooks.add(bookKey);
            console.log(`   ✅ Imported: "${transformedBook.title}"`);
          } else {
            console.log(`   ⏭️  Skipped (exists): "${transformedBook.title}"`);
          }
        } catch (error) {
          errors++;
          console.error(
            `   ❌ Error importing book "${bookData.title}":`,
            error
          );
          if (error instanceof Error) {
            console.error(`   Error details:`, error.message);
          }
        }
      }

      results.push({ category, imported, errors });
      console.log(
        `   📊 Completed ${category}: ${imported} imported, ${errors} errors`
      );

      // Delay between categories
      if (category !== CATEGORIES[CATEGORIES.length - 1]) {
        console.log(
          `   ⏳ Waiting ${DELAY_BETWEEN_REQUESTS}ms before next category...`
        );
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    } catch (error) {
      errors++;
      results.push({ category, imported: 0, errors: 1 });
      console.error(`   ❌ Error processing category ${category}:`, error);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 BOOKS IMPORT SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total books imported: ${totalImported}`);
  console.log(`Categories processed: ${CATEGORIES.length}`);

  console.log("\n📈 Results by Category:");
  console.log("-".repeat(40));

  results.forEach((result) => {
    const status = result.imported > 0 ? "✅" : result.errors > 0 ? "❌" : "⚠️";
    console.log(
      `${status} ${result.category.padEnd(20)} | Books: ${result.imported
        .toString()
        .padStart(2)} | Errors: ${result.errors}`
    );
  });

  const successfulCategories = results.filter((r) => r.imported > 0).length;
  console.log(
    `\n🎯 Successful categories: ${successfulCategories}/${CATEGORIES.length}`
  );
  console.log(`📚 Total books in database: ${totalImported}`);

  if (totalImported > 0) {
    console.log("\n🎉 Book population completed successfully!");
  } else {
    console.log("\n⚠️ No books were imported from Open Library.");
  }
}

// Enhanced manual books for better coverage
const MANUAL_BOOKS = [
  // Classics
  {
    title: "The Art of War",
    authors: ["Sun Tzu"],
    categories: ["Classics"],
    description: "An ancient Chinese military treatise.",
    isbn: "9781590302255",
    price: 12.99,
    availability: "available" as const,
    openLibraryId: "manual-9781590302255",
    imageUrl: null,
    ratingsCount: 0,
  },
  {
    title: "To Kill a Mockingbird",
    authors: ["Harper Lee"],
    categories: ["Classics"],
    description: "A novel about racial inequality and moral growth.",
    isbn: "9780061120084",
    price: 14.99,
    availability: "available" as const,
    openLibraryId: "manual-9780061120084",
    imageUrl: null,
    ratingsCount: 0,
  },
  {
    title: "1984",
    authors: ["George Orwell"],
    categories: ["Classics", "Science Fiction"],
    description: "A dystopian social science fiction novel.",
    isbn: "9780451524935",
    price: 9.99,
    availability: "available" as const,
    openLibraryId: "manual-9780451524935",
    imageUrl: null,
    ratingsCount: 0,
  },

  // Fantasy
  {
    title: "The Hobbit",
    authors: ["J.R.R. Tolkien"],
    categories: ["Fantasy"],
    description: "A fantasy novel about Bilbo Baggins' adventure.",
    isbn: "9780547928227",
    price: 16.99,
    availability: "available" as const,
    openLibraryId: "manual-9780547928227",
    imageUrl: null,
    ratingsCount: 0,
  },
  {
    title: "Harry Potter and the Sorcerer's Stone",
    authors: ["J.K. Rowling"],
    categories: ["Fantasy", "Young Adult"],
    description: "The first book in the Harry Potter series.",
    isbn: "9780590353427",
    price: 19.99,
    availability: "available" as const,
    openLibraryId: "manual-9780590353427",
    imageUrl: null,
    ratingsCount: 0,
  },

  // Science Fiction
  {
    title: "Dune",
    authors: ["Frank Herbert"],
    categories: ["Science Fiction"],
    description: "A science fiction novel set in the distant future.",
    isbn: "9780441172719",
    price: 15.99,
    availability: "available" as const,
    openLibraryId: "manual-9780441172719",
    imageUrl: null,
    ratingsCount: 0,
  },

  // Mystery
  {
    title: "The Hound of the Baskervilles",
    authors: ["Arthur Conan Doyle"],
    categories: ["Mystery"],
    description: "A Sherlock Holmes mystery novel.",
    isbn: "9780199536960",
    price: 8.99,
    availability: "available" as const,
    openLibraryId: "manual-9780199536960",
    imageUrl: null,
    ratingsCount: 0,
  },

  // Romance
  {
    title: "Pride and Prejudice",
    authors: ["Jane Austen"],
    categories: ["Romance", "Classics"],
    description: "A romantic novel of manners.",
    isbn: "9780141439518",
    price: 7.99,
    availability: "available" as const,
    openLibraryId: "manual-9780141439518",
    imageUrl: null,
    ratingsCount: 0,
  },

  // Self Help
  {
    title: "The 7 Habits of Highly Effective People",
    authors: ["Stephen R. Covey"],
    categories: ["Self Help", "Business"],
    description: "A business and self-help book.",
    isbn: "9780743269513",
    price: 16.99,
    availability: "available" as const,
    openLibraryId: "manual-9780743269513",
    imageUrl: null,
    ratingsCount: 0,
  },
];

async function addManualBooks(): Promise<number> {
  console.log("\n📝 Adding manual books for critical categories...");
  let added = 0;

  for (const bookData of MANUAL_BOOKS) {
    try {
      const existingBook = await Book.findOne({
        where: { isbn: bookData.isbn },
      });

      if (!existingBook) {
        await Book.create(bookData);
        added++;
        console.log(`✅ Added manual book: "${bookData.title}"`);
      } else {
        console.log(`⏭️  Manual book exists: "${bookData.title}"`);
      }
    } catch (error) {
      console.error(`❌ Error adding manual book "${bookData.title}":`, error);
      if (error instanceof Error) {
        console.error(`Error details:`, error.message);
      }
    }
  }

  return added;
}

async function main(): Promise<void> {
  try {
    console.log("📊 Starting database seeding...");
    await initializeDatabase();
    console.log("✅ Database connected successfully");

    const initialCount = await Book.count();
    console.log(`📚 Initial book count: ${initialCount}`);

    await populateBooks();

    const manualAdded = await addManualBooks();

    const finalCount = await Book.count();
    console.log(`\n🎯 Final book count: ${finalCount}`);
    console.log(`📈 Books added in this session: ${finalCount - initialCount}`);
    console.log(`📝 Manual books added: ${manualAdded}`);

    if (finalCount > initialCount) {
      console.log("\n🎉 Database seeding completed successfully!");
    } else {
      console.log("\n⚠️ No new books were added to the database.");
    }
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
