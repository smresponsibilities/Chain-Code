#!/usr/bin/env node
// Build-time prerenderer for blog routes.
// Emits dist/blog/index.html + dist/blog/<slug>/index.html with full <head>
// metadata and rendered article HTML inside #root, so JS-less crawlers get
// complete content. The React SPA still mounts over it on load.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://chaincode-xi.vercel.app";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) =>
      h.startsWith("/") ? `<a href="${h}">${t}</a>` : `<a href="${h}" target="_blank" rel="noopener noreferrer">${t}</a>`);
}

export function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inCode = false, listType = null, inTable = false;

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const closeTable = () => { if (inTable) { out.push("</tbody></table>"); inTable = false; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      closeList(); closeTable();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    if (/^\|/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (/^[\s|-]+$/.test(line)) continue; // separator row
      if (!inTable) { out.push('<table><thead><tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>"); inTable = true; }
      else out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      continue;
    }
    closeTable();
    const h = line.match(/^(#{1,3}) (.+)/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const ol = line.match(/^(\d+)\. (.+)/);
    if (ol) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(ol[2])}</li>`); continue;
    }
    const ul = line.match(/^- (.+)/);
    if (ul) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`); continue;
    }
    closeList();
    if (line.trim() === "") continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeTable();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function loadPosts() {
  const dir = join(root, "content", "blog");
  return readdirSync(dir).filter((f) => /\.mdx?$/.test(f)).map((f) => {
    const raw = readFileSync(join(dir, f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const fm = Object.fromEntries(m[1].split("\n").map((l) => {
      const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));
    return { ...fm, html: mdToHtml(raw.slice(m[0].length)) };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

const template = readFileSync(join(root, "dist", "index.html"), "utf8");

const OG_IMAGE = `${SITE}/og.png`;

function headTags({ title, description, url, jsonLd, type = "article" }) {
  return `
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Chain-Code">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Chain-Code — write it once, own it forever">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_IMAGE}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

function shell(templateHtml, { title, description, url, jsonLd, bodyHtml, type }) {
  return templateHtml
    .replace("<title>", `${headTags({ title, description, url, jsonLd, type })}<title data-prerendered="replace">`)
    // strip the placeholder title tag we just displaced
    .replace(/<title data-prerendered="replace">[^<]*<\/title>/, "")
    .replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
}

const posts = loadPosts();

// ---- Landing page prerender (crawler-visible hero copy; SPA mounts over it) ----
const landingHtml = `
<main>
  <p>On-chain proof of original code</p>
  <h1>Write it once. Own it forever.</h1>
  <p>Your solution runs in a sandbox against hidden tests, gets checked against every prior submission, and mints as an NFT certificate with your wallet stamped beside it.</p>
  <h2>How ChainCode works</h2>
  <ol>
    <li><strong>Solve challenges.</strong> Pick a problem from the ledger and write your solution. It runs against hidden tests in the Judge0 sandbox before anyone sees it.</li>
    <li><strong>Originality validation.</strong> Your approach is compared with every prior submission to the problem. Only solutions that differ in substance pass the check.</li>
    <li><strong>Mint &amp; earn.</strong> Accepted solutions mint as NFT certificates anyone can verify on-chain.</li>
  </ol>
</main>`;
writeFileSync(join(root, "dist", "index.html"),
  shell(template, {
    title: "Chain-Code — solve challenges, mint verified code certificates",
    description:
      "Solve coding challenges in a sandboxed judge, pass an originality check, and mint your accepted solution as an on-chain NFT certificate tied to your wallet.",
    url: SITE + "/",
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Chain-Code",
      url: SITE + "/",
    },
    bodyHtml: landingHtml,
  }));

// Blog index
mkdirSync(join(root, "dist", "blog"), { recursive: true });
const listItems = posts.map((p) => `
<article><h2><a href="/blog/${p.slug}">${esc(p.title)}</a></h2>
<p>${esc(p.description)}</p><time datetime="${p.date}">${p.date}</time></article>`).join("\n");
writeFileSync(join(root, "dist", "blog", "index.html"),
  shell(template, {
    title: "Chain-Code blog: code challenges, NFTs, and sandboxes",
    description: "Writing from the Chain-Code workshop: code ownership certificates, sandboxed execution, judge engines, and building for on-chain developers.",
    url: `${SITE}/blog`,
    type: "website",
    jsonLd: { "@context": "https://schema.org", "@type": "Blog", name: "Chain-Code blog", url: `${SITE}/blog` },
    bodyHtml: `<h1>Writing from the Chain-Code workshop</h1>${listItems}`,
  }));

function faqSchema(html) {
  // Question-shaped H2 followed by a paragraph => FAQPage entry
  const items = [];
  const blocks = html.split(/(?=<h2>)/);
  for (const b of blocks) {
    const q = b.match(/^<h2>([^<]*\?[^<]*)<\/h2>/);
    if (!q) continue;
    const a = b.match(/<\/h2>\s*<p>([\s\S]*?)<\/p>/);
    if (a) items.push({
      "@type": "Question",
      name: q[1],
      acceptedAnswer: { "@type": "Answer", text: a[1].replace(/<[^>]+>/g, "") },
    });
  }
  return items.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items,
  } : null;
}

// Post pages
for (const p of posts) {
  const dir = join(root, "dist", "blog", p.slug);
  mkdirSync(dir, { recursive: true });
  const steps = p.schema === "HowTo"
    ? Array.from(p.html.matchAll(/^<li><strong>(.+?)<\/strong>/gm)).map((m2) => ({ "@type": "HowToStep", name: m2[1] }))
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": p.schema === "HowTo" ? "HowTo" : "Article",
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    author: { "@type": "Organization", name: "Chain-Code" },
    url: `${SITE}/blog/${p.slug}`,
    ...(steps ? { step: steps } : {}),
  };
  const faq = faqSchema(p.html);
  const allJsonLd = faq ? [jsonLd, faq] : jsonLd;
  writeFileSync(join(dir, "index.html"),
    shell(template, {
      title: p.title,
      description: p.description,
      url: `${SITE}/blog/${p.slug}`,
      jsonLd: allJsonLd,
      bodyHtml: `<article><p>${p.date}</p>${p.html}</article>`,
    }));
}
console.log(`Prerendered /blog + ${posts.length} posts into dist/blog/`);
