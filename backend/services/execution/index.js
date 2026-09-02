import axios from "axios";

// Judge0 language ids this platform supports — the client sends one of these
// and nothing else is accepted (prevents arbitrary language/toolchain abuse)
export const ALLOWED_LANGUAGE_IDS = new Set([
  63, // JavaScript (Node.js 12/18 depending on provider image)
  71, // Python 3
  62, // Java
  105, // C++ (GCC 9/13 depending on provider image)
]);

const EXECUTION_PROVIDER = (process.env.EXECUTION_PROVIDER || "rapidapi").toLowerCase();

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const SELFHOSTED_JUDGE0_URL = (process.env.SELFHOSTED_JUDGE0_URL || "").replace(/\/+$/, "");
const JUDGE0_AUTHN_HEADER = process.env.JUDGE0_AUTHN_HEADER || "X-Auth-Token";
const JUDGE0_AUTHN_TOKEN = process.env.JUDGE0_AUTHN_TOKEN;

// status ids that mean "still working" — anything else is terminal for a run
const PENDING_STATUSES = new Set([1, 2]); // In Queue, Processing

// judge0 docs use flat status_id; RapidAPI sometimes only nests status:{id}
function statusIdOf(result) {
  return result.status_id ?? result.status?.id;
}

const CREATE_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 40; // ~60s wall clock before giving up

function assertConfigured() {
  if (EXECUTION_PROVIDER === "rapidapi" && !RAPIDAPI_KEY) {
    throw new Error("EXECUTION_PROVIDER=rapidapi but RAPIDAPI_KEY is not set");
  }
  if (EXECUTION_PROVIDER === "selfhosted" && !SELFHOSTED_JUDGE0_URL) {
    throw new Error("EXECUTION_PROVIDER=selfhosted but SELFHOSTED_JUDGE0_URL is not set");
  }
}

function buildBatchBody(code, languageId, testcases) {
  return {
    submissions: testcases.map((tc) => ({
      language_id: languageId,
      source_code: code,
      stdin: tc.input ?? "",
      expected_output: tc.output ?? "",
    })),
  };
}

// RapidAPI's judge0-ce plan does not honor wait=true, so: create the whole
// batch in one request, then poll with ONE batched GET per tick instead of
// polling each submission separately. N testcases cost 2 + ceil(polls) requests.
async function createBatch(baseUrl, body, headers) {
  const res = await axios.post(`${baseUrl}/submissions/batch?base64_encoded=false`, body, {
    headers,
    timeout: CREATE_TIMEOUT_MS,
  });
  const tokens = (res.data || []).map((s) => s.token).filter(Boolean);
  if (tokens.length !== body.submissions.length) {
    throw new Error(`batch creation returned ${tokens.length}/${body.submissions.length} tokens`);
  }
  return tokens;
}

async function fetchBatch(baseUrl, tokens, headers) {
  const res = await axios.get(
    `${baseUrl}/submissions/batch?base64_encoded=false&tokens=${tokens.join(",")}`,
    { headers, timeout: CREATE_TIMEOUT_MS }
  );
  // judge0 self-hosted returns a bare array; RapidAPI wraps it as {submissions:[...]}
  const data = res.data;
  return Array.isArray(data) ? data : (data?.submissions ?? []);
}

// self-hosted instances default enable_wait_result=true: the create call IS
// the result call. If the instance has it disabled (or returns pending rows),
// fall through to the same poll loop RapidAPI needs.
async function executeSelfHosted(code, languageId, testcases) {
  const headers = { "content-type": "application/json" };
  if (JUDGE0_AUTHN_TOKEN) headers[JUDGE0_AUTHN_HEADER] = JUDGE0_AUTHN_TOKEN;

  const url = `${SELFHOSTED_JUDGE0_URL}/submissions/batch`;
  const res = await axios.post(
    `${url}?base64_encoded=false&wait=true`,
    buildBatchBody(code, languageId, testcases),
    { headers, timeout: 120_000 }
  );

  let results = res.data;
  if (!Array.isArray(results) || results.length !== testcases.length) {
    throw new Error("self-hosted batch returned malformed payload");
  }

  if (results.some((r) => PENDING_STATUSES.has(r.status_id))) {
    results = await pollUntilDone(
      SELFHOSTED_JUDGE0_URL,
      results.map((r) => r.token),
      headers
    );
  }
  return results;
}

async function executeRapidApi(code, languageId, testcases) {
  const baseUrl = `https://${RAPIDAPI_HOST}`;
  const headers = {
    "content-type": "application/json",
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  const tokens = await createBatch(baseUrl, buildBatchBody(code, languageId, testcases), headers);
  return pollUntilDone(baseUrl, tokens, headers);
}

async function pollUntilDone(baseUrl, tokens, headers) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const batch = await fetchBatch(baseUrl, tokens, headers);
    if (batch.length && batch.every((r) => !PENDING_STATUSES.has(statusIdOf(r)))) {
      return batch;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("execution timed out while polling for results");
}

// normalized shape consumed by the API response; mirrors the legacy
// client-side polling payload so the existing UI keeps working.
// Never includes expected_output.
const STATUS_DESCRIPTIONS = {
  1: "In Queue",
  2: "Processing",
  3: "Accepted",
  4: "Wrong Answer",
  5: "Time Limit Exceeded",
  6: "Compilation Error",
  7: "Runtime Error (SIGSEGV)",
  8: "Runtime Error (SIGXFSZ)",
  9: "Runtime Error (SIGFPE)",
  10: "Runtime Error (SIGABRT)",
  11: "Runtime Error (NZEC)",
  12: "Runtime Error (Other)",
  13: "Internal Error",
  14: "Exec Format Error",
};

export function normalizeJudge0Result(raw) {
  const sid = statusIdOf(raw);
  return {
    status: {
      id: sid,
      description: raw.status?.description ?? STATUS_DESCRIPTIONS[sid] ?? "Unknown",
    },
    stdout: raw.stdout ?? null,
    stderr: raw.stderr ?? null,
    compile_output: raw.compile_output ?? null,
    time: raw.time ?? null,
    memory: raw.memory ?? null,
  };
}

export async function execute(code, languageId, testcases) {
  assertConfigured();

  let rawResults;
  if (EXECUTION_PROVIDER === "selfhosted") {
    try {
      rawResults = await executeSelfHosted(code, languageId, testcases);
    } catch (err) {
      // self-hosted box down/unreachable — fall back to the RapidAPI free plan
      // (50 req/day) if a key is configured, instead of failing the request.
      if (!RAPIDAPI_KEY) throw err;
      console.warn(`selfhosted judge0 failed (${err.message}), falling back to RapidAPI`);
      rawResults = await executeRapidApi(code, languageId, testcases);
    }
  } else {
    rawResults = await executeRapidApi(code, languageId, testcases);
  }

  if (!Array.isArray(rawResults) || rawResults.length !== testcases.length) {
    throw new Error("execution provider returned wrong number of results");
  }
  return rawResults.map(normalizeJudge0Result);
}
