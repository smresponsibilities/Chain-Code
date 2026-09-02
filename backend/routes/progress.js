import express from "express";
import auth from "../middleware/auth.js";
import { getDaily, getProfile, getLeaderboard } from "../controllers/progressController.js";

const router = express.Router();

router.get("/daily", auth, getDaily);
router.get("/me", auth, getProfile);
router.get("/leaderboard", getLeaderboard); // public — global standings feed a public leaderboard page

export default router;