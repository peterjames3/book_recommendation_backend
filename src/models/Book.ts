import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
  HasMany,
  Index,
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { Cart } from "./Cart.ts";
import { OrderItem } from "./Orderitem.ts";

@Table({
  tableName: "books",
  timestamps: true,
  indexes: [
    {
      fields: ["title"],
    },
    {
      // GIN index for array column
      fields: ["authors"],
      using: "GIN",
    },
    {
      // GIN index for array column
      fields: ["categories"],
      using: "GIN",
    },
    {
      fields: ["isbn"],
    },
    {
      fields: ["isbn13"],
    },
  ],
})
export class Book extends Model {
  @PrimaryKey
  @Default(() => uuidv4())
  @Column(DataType.UUID)
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  openLibraryId?: string;

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
  })
  authors!: string[];

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  isbn?: string;

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  isbn13?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  publishedDate?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  pageCount?: number;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
  })
  categories!: string[];

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  imageUrl?: string;

  @Column({
    type: DataType.DECIMAL(3, 2),
    allowNull: true,
    validate: {
      min: 0,
      max: 5,
    },
  })
  rating?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 0,
  })
  ratingsCount?: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0,
    },
  })
  price?: number;

  @Column({
    type: DataType.ENUM("available", "out_of_stock", "pre_order"),
    allowNull: false,
    defaultValue: "available",
  })
  availability!: "available" | "out_of_stock" | "pre_order";

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @HasMany(() => Cart)
  cartItems!: Cart[];

  @HasMany(() => OrderItem)
  orderItems!: OrderItem[];

  // Virtual fields for search
  get fullText(): string {
    return [
      this.title,
      this.authors.join(" "),
      this.description || "",
      this.categories.join(" "),
    ]
      .join(" ")
      .toLowerCase();
  }
}
