import dotenv from "dotenv";
import LLMService from "../services/llmServices";

// Load environment variables
dotenv.config();

async function testSearchParsing() {
  console.log("🔍 Testing Search Query Parsing...\n");

  const testCases = [
    {
      query: "fantasy books with dragons and wizards",
      expected: ["fantasy", "dragons", "wizards"],
    },
    {
      query: "mystery thriller set in paris",
      expected: ["mystery", "thriller", "paris"],
    },
    {
      query: "romance novels about second chances",
      expected: ["romance", "second chances"],
    },
    {
      query: "science fiction space exploration",
      expected: ["science fiction", "space", "exploration"],
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Query: "${testCase.query}"`);

    try {
      const result = await LLMService.parseNaturalLanguageQuery(testCase.query);

      console.log(`   ✅ Parsed successfully`);
      console.log(`   🔑 Keywords: ${result.extractedKeywords.join(", ")}`);
      console.log(`   📚 Genres: ${result.suggestedGenres.join(", ")}`);
      console.log(`   🔍 Search Terms: ${result.searchTerms.join(", ")}`);

      // Check if expected keywords are found
      const foundExpected = testCase.expected.every((expected) =>
        result.extractedKeywords.some((keyword) =>
          keyword.toLowerCase().includes(expected.toLowerCase())
        )
      );

      if (foundExpected) {
        console.log(`   🎯 All expected keywords found`);
      } else {
        console.log(`   ⚠️  Some expected keywords missing`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log("\n✨ Search Parsing Test Completed!");
}

testSearchParsing().catch(console.error);
