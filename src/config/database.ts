import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User.ts";
import { Book } from "../models/Book.ts";
import { Cart } from "../models/Cart.ts";
import { Order } from "../models/Order.ts";
import { OrderItem } from "../models/Orderitem.ts";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL || "", {
  dialect: "postgres",
  models: [User, Book, Cart, Order, OrderItem],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // This is important for Supabase
    },
  },
});

export default sequelize;

export const initializeDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");

    // Sync all models
    await sequelize.sync({ force: false });
    console.log("✅ Database models synchronized successfully.");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
    process.exit(1);
  }
};
