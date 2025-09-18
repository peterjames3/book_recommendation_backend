import express from "express";
import { body, validationResult } from "express-validator";
import { User } from "../models/User.ts";
import {
  authenticateToken,
  generateToken,
  AuthRequest,
} from "../middleware/auth.ts";

const router = express.Router();

// Register
interface RegisterRequestBody {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

interface RegisterResponseData {
    user: object;
    token: string;
}

router.post(
    "/register",
    [
        body("email").isEmail().normalizeEmail(),
        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters"),
        body("firstName")
            .trim()
            .isLength({ min: 1 })
            .withMessage("First name is required"),
        body("lastName")
            .trim()
            .isLength({ min: 1 })
            .withMessage("Last name is required"),
    ],
    async (
        req: express.Request,
        res: express.Response
    ) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { email, password, firstName, lastName } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: "User with this email already exists",
                });
            }

            // Create new user
            const user = await User.create({
                email,
                password,
                firstName,
                lastName,
            });

            const token = generateToken(user.id);

            res.status(201).json({
                success: true,
                message: "User registered successfully",
                data: {
                    user: user.toJSON(),
                    token,
                },
            });
        } catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to register user",
            });
        }
    }
);

// Login
interface LoginRequestBody {
    email: string;
    password: string;
}

interface LoginResponseData {
    user: object;
    token: string;
}

router.post(
    "/login",
    [
        body("email").isEmail().normalizeEmail(),
        body("password").exists().withMessage("Password is required"),
    ],
    async (
        req: express.Request<{}, {}, LoginRequestBody>,
        res: express.Response
    ) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const { email, password } = req.body;

            // Find user by email
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password",
                });
            }

            // Check password
            const isPasswordValid: boolean = await user.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password",
                });
            }

            const token: string = generateToken(user.id);

            const responseData: LoginResponseData = {
                user: user.toJSON(),
                token,
            };

            res.json({
                success: true,
                message: "Login successful",
                data: responseData,
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to login",
            });
        }
    }
);

// Get current user profile
router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user.toJSON(),
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user profile",
    });
  }
});

// Update user preferences
interface PreferencesRequestBody {
    favoriteGenres?: string[];
    preferredAuthors?: string[];
    readingGoals?: Record<string, any>;
}

interface PreferencesResponseData {
    user: object;
}

router.put(
    "/preferences",
    authenticateToken,
    [
        body("favoriteGenres").optional().isArray(),
        body("preferredAuthors").optional().isArray(),
        body("readingGoals").optional().isObject(),
    ],
    async (
        req: AuthRequest,
        res: express.Response
    ) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: "Validation errors",
                    errors: errors.array(),
                });
            }

            const user = await User.findByPk(req.userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            const { favoriteGenres, preferredAuthors, readingGoals } = req.body;

            const updatedPreferences: Record<string, any> = {
                ...user.preferences,
                ...(favoriteGenres && { favoriteGenres }),
                ...(preferredAuthors && { preferredAuthors }),
                ...(readingGoals && { readingGoals }),
            };

            await user.update({ preferences: updatedPreferences });

            res.json({
                success: true,
                message: "Preferences updated successfully",
                data: user.toJSON(),
            });
        } catch (error) {
            console.error("Update preferences error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to update preferences",
            });
        }
    }
);

// Logout (client-side token removal)
router.post("/logout", (req, res) => {
  res.json({
    success: true,
    message: "Logout successful",
  });
});

export default router;
