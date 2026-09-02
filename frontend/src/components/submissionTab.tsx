import { useEffect, useState } from "react";
import api from "@/utils/api";
import { useProblemContext } from "@/context/ProblemContext";
import AnimatedCard from "./ui/animatedCard";
import { useToast } from "@/hooks/use-toast";

const MAX_CARDS = 12;

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Array<any>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedProblem, submissionsVersion } = useProblemContext();
  const { toast } = useToast();

  useEffect(() => {
    fetchRecentSubmissions();
  }, [selectedProblem, submissionsVersion]);

  const fetchRecentSubmissions = async () => {
    if (!selectedProblem?._id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/submissions/problem/${selectedProblem._id}`
      );
      setSubmissions(response.data);
    } catch (error: any) {
      setError(`Failed to fetch recent submissions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error]);

  if (loading || !selectedProblem?._id) {
    return (
      <div className="flex flex-wrap justify-center gap-5 p-2 lg:justify-start">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-80 w-80 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-white/45">
        No accepted submissions yet — be the first to solve this one.
      </div>
    );
  }

  const sorted = [...submissions].sort(
    (a: any, b: any) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
  const visible = sorted.slice(0, MAX_CARDS);
  const hidden = sorted.length - visible.length;

  return (
    <div className="flex flex-1 flex-col overflow-auto p-2">
      <div className="mb-4 border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="f-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {sorted.length} accepted · newest first
          </p>
          {selectedProblem.sample && (
            <p className="f-mono text-[10px] uppercase tracking-[0.15em] text-[#e8c664]/70">
              sandbox · clears 1h after each solve
            </p>
          )}
        </div>
        <p className="mt-1.5 text-xs text-white/40">
          Every accepted solve mints a certificate — a piece of generative art rendered
          deterministically from that submission's ID, minted as a real ERC-721 NFT on Sepolia.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-5 lg:justify-start">
        {visible.map((submission: any) => (
          <div key={submission._id} className="flex flex-col items-center gap-1.5">
            <AnimatedCard
              title={selectedProblem?.title || "Untitled Problem"}
              code={submission.code}
              to={`/nft/${submission._id}`}
              seed={submission._id}
            />
            <p className="f-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {timeAgo(submission.createdAt)}
            </p>
            {submission.mintTxHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${submission.mintTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-[#e8c664] hover:underline"
              >
                View on Etherscan
              </a>
            )}
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <p className="mt-5 f-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
          +{hidden} more not shown
        </p>
      )}
    </div>
  );
}
