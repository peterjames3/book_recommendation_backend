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
];

const BOOKS_PER_SUBJECT = 5;
const DELAY_BETWEEN_REQUESTS = 2000;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testOpenLibraryService() {
  console.log("🧪 Testing Open Library service...");

  try {
    const testResults = await openLibraryService.searchBooks("harry potter", 3);
    console.log("Open Library test results:", testResults);

    if (!testResults || !testResults.docs || testResults.docs.length === 0) {
      console.log("❌ Open Library service is not returning results");
      return false;
    }

    console.log(
      `✅ Open Library service is working. Found ${testResults.docs.length} books`
    );
    return true;
  } catch (error) {
    console.error("❌ Open Library service test failed:", error);
    return false;
  }
}

async function populateBooks(): Promise<void> {
  console.log("🚀 Starting book population from Open Library...");

  const isServiceWorking = await testOpenLibraryService();
  if (!isServiceWorking) {
    console.log(
      "❌ Cannot proceed with Open Library seeding - service not working"
    );
    return;
  }

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
      while (imported < BOOKS_PER_SUBJECT && attempts < 3) {
        attempts++;
        console.log(`   📄 Attempt ${attempts} for ${subject}...`);

        try {
          const searchResults = await openLibraryService.searchBooksBySubject(
            subject,
            20,
            (page - 1) * 20
          );

          if (!searchResults.docs || searchResults.docs.length === 0) {
            console.log(`   ℹ️  No more books found for ${subject}`);
            break;
          }

          console.log(`   Found ${searchResults.docs.length} books`);
          console.log("   Sample books found:");
          for (let i = 0; i < Math.min(3, searchResults.docs.length); i++) {
            const book = searchResults.docs[i];
            console.log(
              `      - ${book.title} (${book.first_publish_year || "n/a"})`
            );
          }

          let addedThisRound = 0;
          for (const bookData of searchResults.docs) {
            if (imported >= BOOKS_PER_SUBJECT) break;

            const bookKey = bookData.key || bookData.isbn?.[0];
            if (!bookKey || uniqueBooks.has(bookKey)) {
              continue;
            }

            try {
              const transformedBook =
                openLibraryService.transformToBook(bookData);
              console.log(`   Transforming: ${transformedBook.title}`);

              const existingBook = await Book.findOne({
                where: { openLibraryId: transformedBook.openLibraryId },
              });

              if (!existingBook) {
                await Book.create(transformedBook);
                imported++;
                totalImported++;
                uniqueBooks.add(bookKey);
                addedThisRound++;
                console.log(`   ✅ Imported: ${transformedBook.title}`);
              } else {
                console.log(
                  `   ⏭️  Skipped (exists): ${transformedBook.title}`
                );
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
            `   📊 Attempt ${attempts}: ${addedThisRound} books added`
          );

          if (addedThisRound === 0) {
            console.log(`   ⏩ No new books found, moving to next subject...`);
            break;
          }

          page++;
          await delay(1000);
        } catch (pageError) {
          errors++;
          console.error(
            `   ❌ Error on attempt ${attempts}:`,
            pageError instanceof Error ? pageError.message : String(pageError)
          );
          await delay(3000);
        }
      }

      results.push({ subject, imported, errors, attempts });
      console.log(
        `   ✅ Completed ${subject}: ${imported} imported, ${errors} errors (${attempts} attempts)`
      );

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

  console.log("\n📊 BOOKS IMPORT SUMMARY");
  console.log("======================");
  console.log(`Total books imported: ${totalImported}`);
  console.log(`Subjects processed: ${POPULAR_SUBJECTS.length}`);
  console.log("\nDetailed results:");

  results.forEach((result) => {
    console.log(
      `  ${result.subject.padEnd(15)} | Imported: ${result.imported
        .toString()
        .padStart(3)} | Errors: ${result.errors} | Attempts: ${result.attempts}`
    );
  });

  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
  console.log(`\nTotal errors: ${totalErrors}`);

  if (totalImported > 0) {
    console.log("\n🎉 Book population completed successfully!");
  } else {
    console.log("\n⚠️  No books were imported from Open Library.");
  }
}

async function main(): Promise<void> {
  try {
    console.log("📊 Starting database seeding...");
    await initializeDatabase();
    console.log("✅ Database connected successfully");

    await populateBooks();

    const finalCount = await Book.count();
    console.log(`\n🎯 Final book count: ${finalCount}`);

    if (finalCount > 0) {
      console.log("🎉 Database seeding completed successfully!");
    } else {
      console.log("❌ Database seeding failed - no books were added");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  }
}

const scriptTimeout = setTimeout(() => {
  console.error("❌ Script timed out after 30 minutes");
  process.exit(1);
}, 30 * 60 * 1000);

main()
  .then(() => {
    clearTimeout(scriptTimeout);
  })
  .catch((error) => {
    console.error("❌ Unhandled error in main function:", error);
    clearTimeout(scriptTimeout);
    process.exit(1);
  });
