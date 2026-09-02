"use client";

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/utils/api";
import AnimatedCard from "@/components/ui/animatedCard.tsx";
import { BackgroundBeams } from "../ui/background-beams";
import Navbar from "../navbar";

async function getNFTs() {
  const result = (await api.get("/submissions/user")).data;
  return result;
}

const NFTPage: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const [nfts, setNfts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNFTs()
      .then((result) =>
        // newest certificates first — users expect their latest solve on top
        setNfts(
          [...result].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        )
      )
      .catch((err) => {
        console.error("Error fetching NFTs:", err);
        setError("Couldn't load your certificates. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="app-ledger-grid min-h-screen w-full antialiased">
      <Navbar onLogout={onLogout} />
      <div className="relative flex w-full flex-col items-center overflow-hidden">
      <div className="relative z-10 p-8 w-full">
        <h1 className="f-display mt-6 text-center text-[clamp(2.25rem,5vw,4rem)] font-semibold tracking-tight text-[#f5f1e8]">
          My NFTs
        </h1>
        <p className="mx-auto mb-10 mt-2 max-w-lg text-center text-sm text-white/45">
          Each certificate is generative art rendered deterministically from that solve's
          submission ID — same solve, same art, forever — then minted as a real ERC-721 NFT on
          Sepolia to your wallet.
        </p>

        {isLoading && (
          <p className="py-16 text-center f-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            Loading certificates…
          </p>
        )}

        {!isLoading && error && (
          <p className="py-16 text-center text-sm text-[#c0392b]">{error}</p>
        )}

        {!isLoading && !error && nfts.length === 0 && (
          <p className="py-16 text-center text-sm text-white/45">
            You haven't minted any certificates yet.{" "}
            <Link to="/problems" className="text-[#e8c664] hover:underline">
              Solve a problem
            </Link>{" "}
            to mint your first one.
          </p>
        )}

        {!isLoading && !error && nfts.length > 0 && (
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            {nfts.map((nft: any, index: number) => (
              <div key={nft._id} className="flex flex-col items-center">
                <AnimatedCard title={nft.problem.title} code={nft.code} to={`/nft/${nft._id}`} seed={nft._id} />
                <p className="mt-2.5 f-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Certificate {String(index + 1).padStart(2, "0")}</p>
                {nft.mintTxHash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${nft.mintTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 text-[10px] text-[#e8c664] hover:underline"
                  >
                    View on Etherscan
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <BackgroundBeams />
      </div>
    </div>
  );
};

export default NFTPage;
