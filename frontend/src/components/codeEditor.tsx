import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProblemContext } from "@/context/ProblemContext";
import { submitCode, type SubmitPhase } from "@/utils/submitCode";
import { useToast } from "@/hooks/use-toast";
import { getWalletAddress } from "@/utils/auth";

// Map of our language identifiers to Monaco Editor language identifiers
const languageMap = {
  javascript: "javascript",
  python: "python",
  java: "java",
  cpp: "cpp",
};

// Map our language identifiers to Judge0 language IDs
const judge0LanguageMap = {
  javascript: 63, // Node.js
  python: 71, // Python 3
  java: 62, // Java
  cpp: 105, // C++
};

interface ResultType {
  error?: string;
  cancelled?: boolean;
  submissionId?: string;
  mintTxHash?: string;
  results?: Array<{
    status?: { description: string };
    time?: number;
    memory?: number;
  }>;
}

export default function CodeEditor() {
  const { code, setCode, selectedProblem, language, refreshSubmissions } = useProblemContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase | null>(null);
  const [result, setResult] = useState<ResultType | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mintTakingLong, setMintTakingLong] = useState(false);
  // mint success is celebrated with a real centered dialog, not a corner toast
  // — it's the product's peak moment and deserves the screen's attention
  const [mintedOpen, setMintedOpen] = useState(false);
  // pre-mint confirmation: mints are irreversible, so the destination wallet
  // must be confirmed by the user before the on-chain call is made
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);

  const requestMintConfirmation = () =>
    new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmOpen(true);
    });

  const settleMintConfirmation = (ok: boolean) => {
    setConfirmOpen(false);
    confirmResolver.current?.(ok);
    confirmResolver.current = null;
  };

  // if we unmount while the confirmation dialog is open, release the
  // awaiting submitCode instead of leaving its promise hanging forever
  useEffect(() => {
    return () => {
      confirmResolver.current?.(false);
      confirmResolver.current = null;
    };
  }, []);

  // the "verifying" step is honest about what actually happens for a
  // sandbox problem — the backend skips the AI check entirely, so don't
  // imply a real originality check is running
  const stages: { key: SubmitPhase; label: string }[] = [
    { key: "judging", label: `Running ${selectedProblem?.title ?? "the"} test cases` },
    {
      key: "verifying",
      label: selectedProblem?.skipUniqueCheck
        ? "Saving submission (originality check skipped — sandbox)"
        : "Verifying originality",
    },
    {
      key: "minting",
      label: mintTakingLong
        ? "Minting certificate — still working, this can take a couple minutes"
        : "Minting certificate",
    },
  ];

  useEffect(() => {
    setResult(null);
  }, [selectedProblem?._id]);

  // a normal mint confirms in ~20-25s on Sepolia. Past that, let the user
  // know it's not stuck — testnets stall under congestion and the request
  // itself now waits up to 5 minutes before giving up, so silence that long
  // would just look broken.
  useEffect(() => {
    setMintTakingLong(false);
    if (phase !== "minting") return;
    const timer = setTimeout(() => {
      setMintTakingLong(true);
      toast({
        title: "Still minting…",
        description:
          "This is taking longer than usual — Sepolia confirmations can stall under network congestion. Still working, no need to resubmit.",
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (result?.error && !result.cancelled) {
      toast({
        title: `${selectedProblem?.title ?? "Submission"} didn't go through`,
        description: result.error.toString(),
        variant: "destructive",
      });
    }
  }, [result?.error, result?.cancelled]);
  useEffect(() => {
    if (result?.submissionId) {
      setMintedOpen(true);
      refreshSubmissions();
    }
  }, [result?.submissionId]);

  // Get the correct language identifier for Monaco Editor
  const editorLanguage =
    languageMap[language as keyof typeof languageMap] || language;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setResult(null);

    try {
      const data = await submitCode(
        selectedProblem,
        judge0LanguageMap[language as keyof typeof judge0LanguageMap],
        code,
        setPhase,
        requestMintConfirmation
      );
      setResult(data);
    } catch (error: any) {
      console.error("Error submitting code:", error);
    } finally {
      setIsSubmitting(false);
      setPhase(null);
    }
  };

  const activeStageIndex = phase ? stages.findIndex((s) => s.key === phase) : -1;

  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#131020] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)]">
      <Editor
        height="65vh"
        language={editorLanguage}
        value={code}
        onChange={(value) => setCode(value || "")}
        theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: '"Geist Mono", ui-monospace, monospace',
            padding: { top: 12 },
          }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!selectedProblem || isSubmitting}
            title={!selectedProblem ? "Waiting for the problem to load" : undefined}
          >
            {!selectedProblem ? "Loading problem…" : isSubmitting ? "Submitting..." : "Submit Solution"}
          </Button>
          {selectedProblem?.skipUniqueCheck && (
            <span className="f-mono text-[10px] uppercase tracking-[0.15em] text-[#e8c664]">
              Sandbox — originality check skipped
            </span>
          )}
        </div>

        {isSubmitting && (
          <div className="flex flex-col gap-1.5 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
            {stages.map((stage, i) => {
              const state =
                activeStageIndex > i ? "done" : activeStageIndex === i ? "active" : "pending";
              return (
                <div key={stage.key} className="flex items-center gap-2 text-[12px]">
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5 text-[#7fb069]" />
                  ) : state === "active" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d4a017]" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-white/20" />
                  )}
                  <span className={state === "pending" ? "text-white/30" : "text-white/70"}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-1.5">
            {result.results && (
              <>
                <p className="text-[11px] font-medium text-white/70">
                  {result.results.filter((r) => r.status?.description?.toLowerCase().includes("accepted")).length}
                  /{result.results.length} tests passed
                </p>
                {result.results.map((r, index) => {
                  const passed = r.status?.description?.toLowerCase().includes("accepted");
                  return (
                    <p
                      key={index}
                      className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black/25 px-3 py-1.5 font-mono text-[11px] text-white/60"
                    >
                      {passed ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#7fb069]" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-[#d98880]" />
                      )}
                      Test {index + 1}:{" "}
                      <span className={passed ? "text-[#7fb069]" : "text-[#d98880]"}>
                        {r.status?.description}
                      </span>
                      · {r.time}s · {r.memory} KB
                    </p>
                  );
                })}
              </>
            )}
            {result.error && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#c0392b]/30 bg-[#c0392b]/10 px-3 py-1.5">
                <p className="text-[12px] text-[#d98880]">{result.error}</p>
                {/* retry only makes sense for failures without per-test
                    results — a failed test run won't change on resubmit */}
                {!result.results && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="h-7 shrink-0 border-[#c0392b]/40 bg-transparent px-2.5 text-[11px] text-[#d98880] hover:bg-[#c0392b]/15 hover:text-[#d98880]"
                  >
                    <RotateCcw className="mr-1.5 h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onKeyDown={(e) => e.key === "Escape" && settleMintConfirmation(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mint-confirm-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-white/[0.09] bg-[#1a1530] p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)]">
            <p className="f-mono text-[10px] uppercase tracking-[0.25em] text-[#e8c664]">
              Before you mint
            </p>
            <h3
              id="mint-confirm-title"
              className="mt-2 f-display text-lg font-semibold tracking-tight text-[#f5f1e8]"
            >
              Mint to this wallet?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Certificates are permanent — once sealed on-chain they can't be
              moved or reissued.
            </p>
            <p className="mt-4 break-all rounded-md border border-white/[0.09] bg-black/25 px-3 py-2.5 f-mono text-[11px] text-white/70">
              {getWalletAddress() ?? "No wallet address on this account"}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                autoFocus
                onClick={() => settleMintConfirmation(false)}
                className="border-white/[0.12] bg-transparent hover:bg-white/[0.06] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => settleMintConfirmation(true)}
                className="bg-gradient-to-b from-[#ecc76a] to-[#c89d4a] text-[#14102e] shadow-[0_8px_22px_-6px_rgba(200,157,74,0.55)] enabled:hover:-translate-y-px enabled:hover:shadow-[0_12px_28px_-6px_rgba(200,157,74,0.65)]"
              >
                Confirm &amp; mint
              </Button>
            </div>
          </div>
        </div>
      )}

      {mintedOpen && result?.submissionId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onKeyDown={(e) => e.key === "Escape" && setMintedOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mint-success-title"
        >
          <div className="relative w-full max-w-md rounded-xl border border-[#d4a017]/25 bg-[#1a1530] p-8 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)]">
            <button
              type="button"
              onClick={() => setMintedOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-white/50 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#d4a017]/40 bg-[#d4a017]/10">
              <Check className="h-6 w-6 text-[#e8c664]" />
            </div>

            <p className="mt-5 text-center f-mono text-[10px] uppercase tracking-[0.25em] text-[#e8c664]">
              Sealed on-chain
            </p>
            <h3
              id="mint-success-title"
              className="mt-2 text-center f-display text-xl font-semibold tracking-tight text-[#f5f1e8]"
            >
              Certificate minted
            </h3>
            <p className="mt-3 text-center text-sm leading-relaxed text-white/60">
              Your accepted solution for
              "<span className="text-white/85">{selectedProblem?.title}</span>"
              is now permanently sealed on Sepolia and attributed to your wallet.
            </p>

            {result.mintTxHash && (
              <p className="mt-4 break-all rounded-md border border-white/[0.09] bg-black/25 px-3 py-2.5 f-mono text-[11px] text-white/55">
                tx: {result.mintTxHash.slice(0, 22)}…{result.mintTxHash.slice(-8)}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              {result.mintTxHash && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `https://sepolia.etherscan.io/tx/${result.mintTxHash}`,
                      "_blank"
                    )
                  }
                  className="border-white/[0.12] bg-transparent hover:bg-white/[0.06] hover:text-white"
                >
                  View on Etherscan
                </Button>
              )}
              <Button
                type="button"
                autoFocus
                onClick={() => {
                  setMintedOpen(false);
                  navigate(`/nft/${result.submissionId}`);
                }}
                className="bg-gradient-to-b from-[#ecc76a] to-[#c89d4a] text-[#14102e] shadow-[0_8px_22px_-6px_rgba(200,157,74,0.55)] enabled:hover:-translate-y-px enabled:hover:shadow-[0_12px_28px_-6px_rgba(200,157,74,0.65)]"
              >
                View certificate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
