import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testAvailableModels() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error(
      "❌ No API key found. Please set GEMINI_API_KEY or GOOGLE_API_KEY in your .env file"
    );
    process.exit(1);
  }

  console.log("🔍 Testing available Gemini models...\n");
  console.log(`API Key: ${apiKey.substring(0, 10)}...\n`);

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelsToTest = [
    "gemini-1.0-pro",
    "gemini-pro",
    "models/gemini-pro",
    "gemini-1.5-flash",
    "models/gemini-1.5-flash",
    "gemini-1.5-pro",
    "models/gemini-1.5-pro",
  ];

  let workingModel: string | null = null;

  for (const modelName of modelsToTest) {
    try {
      console.log(`🧪 Testing: ${modelName}`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: 100,
        },
      });

      const result = await model.generateContent(
        'Respond with just "OK" if this model works.'
      );
      const response = await result.response;
      console.log(`✅ ${modelName}: SUCCESS - "${response.text().trim()}"\n`);

      if (!workingModel) {
        workingModel = modelName;
      }
    } catch (error: any) {
      console.log(`❌ ${modelName}: FAILED - ${error.message}\n`);
    }
  }

  if (workingModel) {
    console.log(`🎉 Recommended model to use: '${workingModel}'`);
    console.log(`\n💡 Add this to your LLM service:`);
    console.log(
      `this.model = genAI.getGenerativeModel({ model: '${workingModel}' })`
    );
  } else {
    console.log("🚨 No working models found. Please check:");
    console.log("   - Your API key is valid");
    console.log("   - You have access to Gemini API");
    console.log("   - Your billing is set up correctly");
  }
}

// Run the test
testAvailableModels().catch(console.error);
