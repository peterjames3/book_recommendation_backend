import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User.ts";
import { OrderItem } from "./Orderitem.ts";

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

@Table({
  tableName: "orders",
  timestamps: true,
})
export class Order extends Model {
  @PrimaryKey
  @Default(() => uuidv4())
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId!: string;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
    },
  })
  totalAmount!: number;

  @Column({
    type: DataType.ENUM(
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled"
    ),
    allowNull: false,
    defaultValue: "pending",
  })
  status!: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  shippingAddress!: Address;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  paymentMethod!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  trackingNumber?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  notes?: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => User)
  user!: User;

  @HasMany(() => OrderItem)
  items!: OrderItem[];
}
