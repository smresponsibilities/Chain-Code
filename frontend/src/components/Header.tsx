import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { useAuthToken, setAuthToken } from "@/utils/auth";

const loggedOutLinks = [
  { to: "/#features", label: "Features" },
  { to: "/login", label: "Practice" },
];

const loggedInLinks = [
  { to: "/problems", label: "Problems" },
  { to: "/try", label: "Try it yourself" },
  { to: "/polls", label: "Polls" },
  { to: "/nft", label: "My NFTs" },
];

const FEEDBACK_EMAIL = "shivammahajan.mail@gmail.com";
const FEEDBACK_SUBJECT = "ChainCode Feedback";
const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`;
// Gmail web compose: works in any browser, no OS mail handler needed. mailto:
// silently does nothing on desktops without a registered client, which is why
// this menu exists instead of a bare link.
const FEEDBACK_GMAIL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  FEEDBACK_EMAIL,
)}&su=${encodeURIComponent(FEEDBACK_SUBJECT)}`;

// `inline` renders the panel in flow instead of absolutely positioned: the
// mobile nav is overflow-hidden for its height animation, which clips a popover.
function FeedbackMenu({
  className,
  onNavigate,
  inline = false,
}: {
  className: string;
  onNavigate?: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL);
    } catch {
      // clipboard blocked (permissions, insecure context) — the address is
      // shown in the menu, so the user can still select it by hand
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const item =
    "block w-full px-3 py-2 text-left text-sm text-white/70 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={className}
      >
        Feedback
      </button>
      {open && (
        <div
          role="menu"
          className={`overflow-hidden rounded-lg border border-white/[0.1] bg-[#1b1638] ${
            inline
              ? "mb-1 w-full"
              : "absolute right-0 z-50 mt-2 w-60 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
          }`}
        >
          <a
            href={FEEDBACK_GMAIL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            Compose in Gmail
          </a>
          <a
            href={FEEDBACK_MAILTO}
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            Open mail app
          </a>
          <button type="button" role="menuitem" onClick={copy} className={item}>
            {copied ? "Address copied" : "Copy address"}
          </button>
          <p className="select-all border-t border-white/[0.08] px-3 py-2 text-xs text-white/40">
            {FEEDBACK_EMAIL}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Header({ onLogout }: { onLogout?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const token = useAuthToken();

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [location]);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      setAuthToken(null);
      navigate("/");
    }
    setOpen(false);
  };

  const links = token ? loggedInLinks : loggedOutLinks;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#14102e]/90 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8 md:gap-10">
          <Link
            to="/"
            className="f-display inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-[#f5f1e8] sm:text-xl"
            aria-label="ChainCode Home"
            onClick={() => setOpen(false)}
          >
            <span className="inline-flex shrink-0 rounded-[10px] border border-[#d4a017]/70 p-px">
              <img
                src="/logo.svg"
                alt=""
                aria-hidden="true"
                className="h-9 w-9 rounded-[9px]"
              />
            </span>
            <span>ChainCode</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main Navigation">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-white/55 transition-colors duration-200 hover:text-[#d4a017]"
              >
                {link.label}
              </Link>
            ))}
            <FeedbackMenu className="text-sm font-medium text-white/55 transition-colors duration-200 hover:text-[#d4a017]" />
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {token ? (
            <button
              onClick={handleLogout}
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white md:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white sm:inline-block"
            >
              Log in
            </Link>
          )}

          {!token && (
            <Link
              to="/signup"
              className="whitespace-nowrap rounded-md bg-gradient-to-b from-[#ecc76a] to-[#c89d4a] px-3.5 py-2 text-xs font-semibold text-[#14102e] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_22px_-6px_rgba(200,157,74,0.55)] sm:px-5 sm:text-sm"
            >
              Create account
            </Link>
          )}

          {/* mobile toggle */}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-md transition-colors duration-200 hover:bg-white/[0.05] md:hidden"
          >
            <motion.span
              animate={open ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
              className="block h-px w-4 bg-white/80"
            />
            <motion.span
              animate={open ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
              className="block h-px w-4 bg-white/80"
            />
          </button>
        </div>
      </div>

      {/* mobile dropdown */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-white/[0.08] md:hidden"
            aria-label="Mobile Navigation"
          >
            <div className="container flex flex-col py-2">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="py-3 text-sm font-medium text-white/65 transition-colors duration-200 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              <FeedbackMenu
                inline
                className="w-full py-3 text-left text-sm font-medium text-white/65 transition-colors duration-200 hover:text-white"
                onNavigate={() => setOpen(false)}
              />
              {token ? (
                <>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 border-t border-white/[0.06] py-3 text-left text-sm font-medium text-white/65 transition-colors duration-200 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="border-t border-white/[0.06] py-3 text-sm font-medium text-white/65 transition-colors duration-200 hover:text-white"
                >
                  Log in
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
