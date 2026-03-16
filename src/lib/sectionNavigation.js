import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAtlasFlowHash, getPagePath } from "@/lib/routes";

const SECTION_SCROLL_OFFSET = 108;

function applyHashToUrl(hash, search = "") {
  if (typeof window === "undefined") return;
  const nextSearch = search || window.location.search;
  const nextUrl = hash ? `${window.location.pathname}${nextSearch}${hash}` : `${window.location.pathname}${nextSearch}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

export function scrollToAtlasSection(
  sectionId,
  { behavior = "smooth", offset = SECTION_SCROLL_OFFSET, updateUrl = true, search = "" } = {},
) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const anchorId = String(sectionId || "").replace(/^#/, "").trim();
  if (!anchorId) return false;

  const node = document.getElementById(anchorId);
  if (!node) return false;

  const top = Math.max(0, window.scrollY + node.getBoundingClientRect().top - offset);
  window.scrollTo({ top, behavior });
  if (updateUrl) {
    applyHashToUrl(`#${anchorId}`, search);
  }
  return true;
}

export function useAtlasSectionNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (sectionId, { search = "", offset = SECTION_SCROLL_OFFSET } = {}) => {
      const anchorId = String(sectionId || "").replace(/^#/, "").trim();
      if (!anchorId) return;

      const atlasFlowPath = getPagePath("AtlasFlow");
      if (location.pathname === atlasFlowPath) {
        const scrolled = scrollToAtlasSection(anchorId, { offset, search });
        if (scrolled) return;
      }

      navigate({
        pathname: atlasFlowPath,
        search,
        hash: buildAtlasFlowHash(anchorId).replace("/", ""),
      });
    },
    [location.pathname, navigate],
  );
}
