import "../styles/tokens.css";
import "../styles/frame.css";
import "../styles/changelog.css";
import "../styles/docs.css";

const root = document.querySelector("#docs-root");

if (!root) {
  throw new Error("Docs page root is missing.");
}

// Mark the section being read in the navigation: the last heading that has
// crossed the top third of the viewport.
function trackCurrentSection() {
  const links = new Map(
    [...root.querySelectorAll(".docs-nav a[href^='#']")].map((link) => [
      link.getAttribute("href").slice(1),
      link,
    ]),
  );
  const headings = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter((heading) => heading !== null);
  const nav = root.querySelector(".docs-nav");
  let current = null;

  function markCurrent() {
    const line = window.innerHeight / 3;
    const passed = headings.filter((heading) => heading.getBoundingClientRect().top <= line);
    const heading = passed.at(-1) ?? headings[0];

    if (!heading || heading === current) {
      return;
    }

    current = heading;
    const link = links.get(heading.id);

    for (const item of root.querySelectorAll(".docs-nav [aria-current]")) {
      item.removeAttribute("aria-current");
    }

    const guideLink = link.closest("[data-docs-guide]")?.querySelector(".docs-nav__guide");
    link.setAttribute("aria-current", "location");
    guideLink?.setAttribute("aria-current", "true");
    // Narrow screens hide the section links and show only the guide strip.
    reveal(link.offsetParent === null ? guideLink : link);
  }

  // Keep the marked link inside the index's own scroll box. Moved by hand:
  // `scrollIntoView` would cancel a smooth page scroll already under way.
  function reveal(link) {
    if (!link) {
      return;
    }

    const box = nav.getBoundingClientRect();
    const item = link.getBoundingClientRect();

    if (item.top < box.top || item.bottom > box.bottom) {
      nav.scrollTop += item.top - box.top - box.height / 3;
    }

    if (item.left < box.left || item.right > box.right) {
      nav.scrollLeft += item.left - box.left - box.width / 3;
    }
  }

  let frame = 0;

  window.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(markCurrent);
    },
    { passive: true },
  );
  markCurrent();
}

// Every locale shares the English heading ids, so switching language keeps the
// reader on the section they were reading.
root.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-docs-locale]");

  if (link && location.hash) {
    link.hash = location.hash;
  }
});

// The build prerenders the guides into the HTML, so production never loads
// the markdown or its parser; only dev, where nothing prerenders, renders here.
// Each locale's page is its own HTML file, which names its language.
if (root.textContent.trim() === "") {
  void import("./docs-view.js").then(({ renderDocsPage }) => {
    root.innerHTML = renderDocsPage(document.documentElement.lang).markup;

    if (location.hash) {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    }

    trackCurrentSection();
  });
} else {
  trackCurrentSection();
}
