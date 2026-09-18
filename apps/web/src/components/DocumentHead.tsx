import { useEffect } from "react";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "../site";

type Props = {
  title?: string;
  description?: string;
  path?: string;
};

export function DocumentHead({ title, description = DEFAULT_DESCRIPTION, path }: Props) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    const canonical = `${SITE_URL}${path ?? window.location.pathname}`;
    setMeta("description", description);
    setMeta("og:title", title ? `${title} · ${SITE_NAME}` : SITE_NAME, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", canonical, "property");
    setLink("canonical", canonical);
  }, [title, description, path]);
  return null;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let node = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", rel);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}
