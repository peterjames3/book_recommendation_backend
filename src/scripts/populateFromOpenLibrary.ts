import "reflect-metadata";
import { initializeDatabase } from "../config/database.ts";
import { Book } from "../models/Book.ts";
import openLibraryService from "../services/openLibraryService.ts";

const POPULAR_SUBJECTS = [
  "fiction",
  "mystery",
  "romance",
  "science fiction",
  "fantasy",
  "biography",
  "history",
  "self-help",
  "business",
  "technology",
  "health",
  "cooking",
  "art",
  "philosophy",
  "poetry",
  "drama",
  "children",
  "young adult",
  "comics",
  "education",
];

const BOOKS_PER_SUBJECT = 15;
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5 seconds to be respectful to the API

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function populateBooks(): Promise<void> {
  console.log("🚀 Starting book population from Open Library...");

  let totalImported = 0;
  const results: Array<{ subject: string; imported: number; errors: number }> =
    [];

  for (const subject of POPULAR_SUBJECTS) {
    console.log(`\n📚 Processing subject: ${subject}`);

    let imported = 0;
    let errors = 0;

    try {
      // Search for books in this subject
      const searchResults = await openLibraryService.searchBySubject(
        subject,
        BOOKS_PER_SUBJECT
      );

      console.log(`   Found ${searchResults.docs.length} books for ${subject}`);

      for (const bookData of searchResults.docs) {
        try {
          // Transform to our format
          const transformedBook = openLibraryService.transformToBook(bookData);

          // Check if book already exists
          const existingBook = await Book.findOne({
            where: {
              openLibraryId: transformedBook.openLibraryId,
            },
          });

          if (!existingBook) {
            // Create new book
            await Book.create(transformedBook);
            imported++;
            totalImported++;

            if (imported % 5 === 0) {
              console.log(`   ✅ Imported ${imported} books for ${subject}...`);
            }
          }
        } catch (error) {
          errors++;
          if (error instanceof Error) {
            console.error(`   ❌ Error importing book:`, error.message);
          } else {
            console.error(`   ❌ Error importing book:`, error);
          }
        }
      }

      results.push({ subject, imported, errors });
      console.log(
        `   ✅ Completed ${subject}: ${imported} imported, ${errors} errors`
      );

      // Delay between subjects to be respectful to the API
      if (subject !== POPULAR_SUBJECTS[POPULAR_SUBJECTS.length - 1]) {
        console.log(
          `   ⏳ Waiting ${DELAY_BETWEEN_REQUESTS}ms before next subject...`
        );
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    } catch (error) {
      errors++;
      results.push({ subject, imported: 0, errors: 1 });
      console.error(
        `   ❌ Error processing subject ${subject}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Print summary
  console.log("\n📊 IMPORT SUMMARY");
  console.log("================");
  console.log(`Total books imported: ${totalImported}`);
  console.log(`Subjects processed: ${POPULAR_SUBJECTS.length}`);
  console.log("\nDetailed results:");

  results.forEach((result) => {
    console.log(
      `  ${result.subject.padEnd(15)} | Imported: ${result.imported
        .toString()
        .padStart(3)} | Errors: ${result.errors}`
    );
  });

  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  console.log(`\nTotal errors: ${totalErrors}`);

  if (totalImported > 0) {
    console.log("\n🎉 Book population completed successfully!");
  } else {
    console.log("\n⚠️  No books were imported. Check the errors above.");
  }
}

async function addSampleBooks(): Promise<void> {
  console.log("\n📖 Adding sample books with detailed information...");

  const sampleBooks = [
    {
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
      isbn: "9780743273565",
      description:
        "A classic American novel set in the Jazz Age, exploring themes of wealth, love, and the American Dream.",
      publishedDate: "1925",
      pageCount: 180,
      categories: ["Fiction", "Classic Literature", "American Literature"],
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
      rating: 4.2,
      ratingsCount: 1250000,
      price: 12.99,
      availability: "available" as const,
    },
    {
      title: "To Kill a Mockingbird",
      authors: ["Harper Lee"],
      isbn: "9780061120084",
      description:
        "A gripping tale of racial injustice and childhood innocence in the American South.",
      publishedDate: "1960",
      pageCount: 376,
      categories: ["Fiction", "Classic Literature", "Drama"],
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780061120084-L.jpg",
      rating: 4.3,
      ratingsCount: 980000,
      price: 13.99,
      availability: "available" as const,
    },
    {
      title: "1984",
      authors: ["George Orwell"],
      isbn: "9780451524935",
      description:
        "A dystopian social science fiction novel about totalitarian control and surveillance.",
      publishedDate: "1949",
      pageCount: 328,
      categories: [
        "Fiction",
        "Science Fiction",
        "Dystopian",
        "Political Fiction",
      ],
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg",
      rating: 4.4,
      ratingsCount: 1100000,
      price: 14.99,
      availability: "available" as const,
    },
    {
      title: "Pride and Prejudice",
      authors: ["Jane Austen"],
      isbn: "9780141439518",
      description:
        "A romantic novel about manners, upbringing, morality, education, and marriage in Georgian England.",
      publishedDate: "1813",
      pageCount: 432,
      categories: ["Fiction", "Romance", "Classic Literature"],
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg",
      rating: 4.1,
      ratingsCount: 850000,
      price: 11.99,
      availability: "available" as const,
    },
    {
      title: "The Catcher in the Rye",
      authors: ["J.D. Salinger"],
      isbn: "9780316769174",
      description:
        "A controversial novel about teenage rebellion and alienation in post-war America.",
      publishedDate: "1951",
      pageCount: 277,
      categories: ["Fiction", "Coming of Age", "Classic Literature"],
      imageUrl: "https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg",
      rating: 3.8,
      ratingsCount: 720000,
      price: 13.5,
      availability: "available" as const,
    },
  ];

  let sampleImported = 0;

  for (const bookData of sampleBooks) {
    try {
      const existingBook = await Book.findOne({
        where: {
          isbn: bookData.isbn,
        },
      });

      if (!existingBook) {
        await Book.create(bookData);
        sampleImported++;
        console.log(`   ✅ Added: ${bookData.title}`);
      } else {
        console.log(`   ⏭️  Skipped (exists): ${bookData.title}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`   ❌ Error adding ${bookData.title}:`, error.message);
      } else {
        console.error(`   ❌ Error adding ${bookData.title}:`, error);
      }
    }
  }

  console.log(
    `\n📚 Sample books added: ${sampleImported}/${sampleBooks.length}`
  );
}

async function main(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();

    // Check current book count
    const currentCount = await Book.count();
    console.log(`📊 Current books in database: ${currentCount}`);

    if (currentCount === 0) {
      console.log("🔄 Database is empty, starting full population...");

      // Add sample books first
      await addSampleBooks();

      // Then populate from Open Library
      await populateBooks();
    } else {
      console.log("📚 Database already has books. Skipping population.");
      console.log("💡 To force repopulation, clear the database first.");

      // Still add sample books if they don't exist
      await addSampleBooks();
    }

    const finalCount = await Book.count();
    console.log(`\n🎯 Final book count: ${finalCount}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Population failed:", error);
    process.exit(1);
  }
}

// Run the population script
if (require.main === module) {
  main();
}

export { populateBooks, addSampleBooks };
