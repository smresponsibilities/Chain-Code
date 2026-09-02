import Problem from "../models/Problem.js";
import User from "../models/User.js";
import Submission from "../models/Submission.js";

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY_MS = 86400000;

// distinct UTC days the user has accepted at least one solution on
async function solvedDaySet(userId) {
  const docs = await Submission.find({ user: userId }, "createdAt").lean();
  const days = new Set();
  for (const d of docs) days.add(startOfDay(new Date(d.createdAt)).getTime());
  return days;
}

// current streak = consecutive days ending today; if today's not yet solved,
// count the run ending yesterday (still "alive" until the day ends)
function computeStreak(days) {
  const today = startOfDay(new Date()).getTime();
  let cursor = days.has(today) ? today : today - DAY_MS;
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor -= DAY_MS;
  }
  let best = 0;
  const sorted = [...days].sort((a, b) => a - b);
  let run = 0;
  let prev = null;
  for (const t of sorted) {
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best, solvedToday: days.has(today) };
}

// deterministic daily pick: same problem for everyone on the same day — no
// schema/migration needed, selects by day index over the live problem set
async function pickDailyProblem() {
  const problems = await Problem.find({}, "title difficulty topics", {
    lean: true,
  });
  if (problems.length === 0) return null;
  const dayIndex = Math.floor(startOfDay(new Date()).getTime() / DAY_MS);
  return problems[dayIndex % problems.length];
}

// GET /api/progress/daily — today's problem + the user's streak
export const getDaily = async (req, res) => {
  try {
    const userId = req.user.user.id;
    const days = await solvedDaySet(userId);
    const { current, best, solvedToday } = computeStreak(days);
    const dailyProblem = await pickDailyProblem();

    let solvedDaily = false;
    if (dailyProblem) {
      solvedDaily = Boolean(
        await Submission.exists({ user: userId, problem: dailyProblem._id, minted: true })
      );
    }

    res.json({
      dailyProblem,
      streak: { current, best, solvedToday },
      solvedDaily,
    });
  } catch (error) {
    console.error("getDaily error:", error);
    res.status(500).json({ error: "Failed to load daily challenge" });
  }
};

// GET /api/progress/me — profile stats for the logged-in user
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.user.id;
    const user = await User.findById(userId).select("username email createdAt");
    if (!user) return res.status(404).json({ error: "User not found" });

    const submissions = await Submission.find({ user: userId })
      .populate("problem", "title difficulty")
      .sort({ createdAt: -1 })
      .lean();

    const days = new Set(
      submissions.map((s) => startOfDay(new Date(s.createdAt)).getTime())
    );
    const streak = computeStreak(days);

    const minted = submissions.filter((s) => s.minted);
    const byDifficulty = {};
    const byLanguage = {};
    submissions.forEach((s) => {
      if (s.problem?.difficulty)
        byDifficulty[s.problem.difficulty] = (byDifficulty[s.problem.difficulty] || 0) + 1;
      if (s.language) byLanguage[s.language] = (byLanguage[s.language] || 0) + 1;
    });

    res.json({
      user: {
        username: user.username,
        email: user.email,
        joined: user.createdAt,
      },
      totals: {
        solves: submissions.length,
        minted: minted.length,
        distinctProblems: new Set(
          submissions.map((s) => s.problem?._id?.toString())
        ).size,
      },
      streak,
      byDifficulty,
      byLanguage,
      certs: minted.map((s) => ({
        submissionId: s._id,
        problemTitle: s.problem?.title,
        difficulty: s.problem?.difficulty,
        language: s.language,
        mintedAt: s.createdAt,
        mintTxHash: s.mintTxHash,
      })),
    });
  } catch (error) {
    console.error("getProfile error:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
};

// GET /api/leaderboard — global standings
export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await Submission.aggregate([
      {
        $group: {
          _id: "$user",
          solves: { $sum: 1 },
          minted: { $sum: { $cond: ["$minted", 1, 0] } },
        },
      },
      { $limit: 500 },
    ]);
    const userIds = rows.map((r) => r._id);
    const users = await User.find({ _id: { $in: userIds } }, "username").lean();
    const nameMap = new Map(users.map((u) => [u._id.toString(), u.username]));

    const ranked = rows
      .map((r) => ({
        username: nameMap.get(r._id.toString()) || "anon",
        solves: r.solves,
        minted: r.minted,
        points: r.solves + r.minted * 2,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);

    res.json({ rows: ranked });
  } catch (error) {
    console.error("getLeaderboard error:", error);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
};