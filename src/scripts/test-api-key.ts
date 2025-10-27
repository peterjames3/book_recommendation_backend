// src/scripts/test-api-key.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function testAPIKey() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  console.log("🔑 Testing API Key Configuration...\n");

  if (!apiKey) {
    console.log("❌ No API key found in environment variables");
    console.log(
      "   Please set either GEMINI_API_KEY or GOOGLE_API_KEY in your .env file"
    );
    return false;
  }

  console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...`);
  console.log(`   Key length: ${apiKey.length} characters\n`);

  // Test if the API key format looks valid
  if (apiKey.length < 30) {
    console.log(
      "❌ API key appears too short. Gemini API keys are typically 39+ characters"
    );
    return false;
  }

  // Test basic API connectivity
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try to list available models (this should work even if specific models don't)
    console.log("🔍 Testing API connectivity...");

    // Use a simple, widely available model for basic test
    const model = genAI.getGenerativeModel({
      model: "gemini-1.0-pro",
      generationConfig: { maxOutputTokens: 10 },
    });

    const result = await model.generateContent("Say OK");
    console.log("✅ Basic API connectivity: SUCCESS");
    console.log(`   Response: "${result.response.text()}"`);
    return true;
  } catch (error: any) {
    console.log("❌ API connectivity: FAILED");
    console.log(`   Error: ${error.message}`);

    // Provide specific troubleshooting based on error
    if (error.message.includes("API key not valid")) {
      console.log("\n💡 Your API key appears invalid. Please:");
      console.log("   1. Go to https://aistudio.google.com/");
      console.log("   2. Create a new API key");
      console.log("   3. Update your .env file");
    } else if (error.message.includes("quota")) {
      console.log(
        "\n💡 You may have exceeded your quota or need to enable billing:"
      );
      console.log("   1. Go to https://console.cloud.google.com/");
      console.log("   2. Check your Gemini API quota");
      console.log("   3. Ensure billing is enabled for your project");
    } else if (error.message.includes("permission")) {
      console.log("\n💡 Permission denied. Please:");
      console.log(
        "   1. Ensure the Gemini API is enabled in Google Cloud Console"
      );
      console.log("   2. Check that your API key has the correct permissions");
    }

    return false;
  }
}

// Add this script to package.json
console.log("📝 Add this to package.json scripts:");
console.log('"test:api": "tsx src/scripts/test-api-key.ts"');

testAPIKey().catch(console.error);
