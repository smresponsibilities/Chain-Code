import { useEffect } from "react";

const SITE = "https://chaincode-xi.vercel.app";

type Seo = {
  title: string;
  description: string;
  path: string;          // e.g. /blog/my-slug
  type?: "website" | "article";
  jsonLd?: object;
};

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Per-route <head> control for the SPA. Removes route-specific tags on unmount.
export function useSeo({ title, description, path, type = "website", jsonLd }: Seo) {
  useEffect(() => {
    const url = SITE + path;
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", type);
    setMeta("property", "og:image", SITE + "/og.png");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:image", SITE + "/og.png");

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      const link = document.createElement("link");
      link.rel = "canonical";
      link.href = url;
      document.head.appendChild(link);
    } else {
      canonical.href = url;
    }

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.routeJsonld = "true";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      script?.remove();
    };
  }, [title, description, path, type, jsonLd]);
}
