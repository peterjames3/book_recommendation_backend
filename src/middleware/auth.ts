import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { User } from "../models/User";

// Check for JWT_SECRET once at the top
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

// Store the secret in a constant
const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Access token required",
      });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
    };

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid token - user not found",
      });
      return;
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
      };
      const user = await User.findByPk(decoded.userId);

      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't return an error, just continue without user
    next();
  }
};

export const generateToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: Number(JWT_EXPIRES_IN),
  };

  return jwt.sign({ userId }, JWT_SECRET, options);
};
// export const generateToken = (userId: string): string => {
//   return jwt.sign({ userId }, JWT_SECRET, {
//     expiresIn: JWT_EXPIRES_IN,
//   });
// };
