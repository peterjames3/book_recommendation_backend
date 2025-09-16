import { Sequelize } from "sequelize-typescript";
import { User } from "../models/User";
import { Book } from "../models/Book";
import { Cart } from "../models/Cart";
import { Order } from "../models/Order";
import { OrderItem } from "../models/Orderitem";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize({
  database: process.env.DB_NAME || "litkenya_books",
  dialect: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  models: [User, Book, Cart, Order, OrderItem],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
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
