import "reflect-metadata";
import { initializeDatabase } from "../config/database";
import { Book } from "../models/Book";
import openLibraryService from "../services/openLibraryService";

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
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds to be respectful to the API
const MIN_YEAR = 2015; // Only books from 2015 onwards

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function populateLatestBooks(): Promise<void> {
  console.log("🚀 Starting LATEST book population from Open Library...");
  console.log(`📅 Only fetching books from ${MIN_YEAR} onwards`);

  let totalImported = 0;
  const results: Array<{
    subject: string;
    imported: number;
    errors: number;
    attempts: number;
  }> = [];

  for (const subject of POPULAR_SUBJECTS) {
    console.log(`\n📚 Processing subject: ${subject}`);

    let imported = 0;
    let errors = 0;
    let attempts = 0;
    let page = 1;
    const uniqueBooks = new Set<string>();

    try {
      // Keep fetching until we get 15 recent books or run out of pages
      while (imported < BOOKS_PER_SUBJECT && attempts < 50) {
        // Safety limit
        attempts++;
        console.log(`   📄 Page ${page} for ${subject}...`);

        try {
          // Search for books in this subject, sorted by newest first
          const searchResults = await openLibraryService.searchBySubject(
            subject,
            50, // Get more to filter for recent ones
            (page - 1) * 50 // Calculate offset
          );

          if (!searchResults.docs || searchResults.docs.length === 0) {
            console.log(`   ℹ️  No more books found for ${subject}`);
            break;
          }

          console.log(
            `   Found ${searchResults.docs.length} books on page ${page}`
          );

          let recentBooksCount = 0;
          for (const bookData of searchResults.docs) {
            // Skip if we already have enough books
            if (imported >= BOOKS_PER_SUBJECT) break;

            // Check if book is recent enough
            const publishYear = bookData.first_publish_year;
            if (!publishYear || publishYear < MIN_YEAR) {
              continue; // Skip old books
            }

            // Check for duplicates
            const bookKey = bookData.key || bookData.isbn?.[0];
            if (!bookKey || uniqueBooks.has(bookKey)) {
              continue;
            }

            try {
              // Transform to our format
              const transformedBook =
                openLibraryService.transformToBook(bookData);

              // Check if book already exists in database
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
                uniqueBooks.add(bookKey);
                recentBooksCount++;

                if (imported % 5 === 0) {
                  console.log(
                    `   ✅ Imported ${imported} recent books for ${subject}...`
                  );
                }
              }
            } catch (error) {
              errors++;
              console.error(
                `   ❌ Error importing book:`,
                error instanceof Error ? error.message : String(error)
              );
            }
          }

          console.log(
            `   📊 Page ${page}: ${recentBooksCount} recent books added`
          );

          // If we didn't find any recent books on this page, move to next
          if (recentBooksCount === 0) {
            console.log(
              `   ⏩ No recent books on page ${page}, moving to next...`
            );
          }

          page++;

          // Small delay between pages
          await delay(500);
        } catch (pageError) {
          errors++;
          console.error(
            `   ❌ Error on page ${page}:`,
            pageError instanceof Error ? pageError.message : String(pageError)
          );
          // Wait longer before retrying
          await delay(5000);
          break;
        }
      }

      results.push({ subject, imported, errors, attempts });
      console.log(
        `   ✅ Completed ${subject}: ${imported} imported, ${errors} errors (${attempts} pages)`
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
      results.push({ subject, imported: 0, errors: 1, attempts: 0 });
      console.error(
        `   ❌ Error processing subject ${subject}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Print summary
  console.log("\n📊 LATEST BOOKS IMPORT SUMMARY");
  console.log("=============================");
  console.log(`Total books imported: ${totalImported}`);
  console.log(`Subjects processed: ${POPULAR_SUBJECTS.length}`);
  console.log(`Minimum year: ${MIN_YEAR}`);
  console.log("\nDetailed results:");

  results.forEach((result) => {
    console.log(
      `  ${result.subject.padEnd(15)} | Imported: ${result.imported
        .toString()
        .padStart(3)} | Errors: ${result.errors} | Pages: ${result.attempts}`
    );
  });

  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  console.log(`\nTotal errors: ${totalErrors}`);

  if (totalImported > 0) {
    console.log("\n🎉 Latest book population completed successfully!");
  } else {
    console.log("\n⚠️  No recent books were imported. You may need to:");
    console.log("   - Decrease MIN_YEAR (currently " + MIN_YEAR + ")");
    console.log("   - Check your internet connection");
    console.log("   - Verify Open Library API is accessible");
  }
}

async function main(): Promise<void> {
  try {
    console.log("📊 Starting database seeding...");

    // Initialize database connection
    await initializeDatabase();
    console.log("✅ Database connected successfully");

    // Run the population script
    await populateLatestBooks();

    console.log("🎉 Database seeding completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  }
}

// Add a timeout to prevent the script from running indefinitely
const scriptTimeout = setTimeout(() => {
  console.error("❌ Script timed out after 30 minutes");
  process.exit(1);
}, 30 * 60 * 1000); // 30 minutes

// Run the main function
main()
  .then(() => {
    clearTimeout(scriptTimeout);
  })
  .catch((error) => {
    console.error("❌ Unhandled error in main function:", error);
    clearTimeout(scriptTimeout);
    process.exit(1);
  });
