import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
};

export default function SearchPage() {
  return (
    <main className="page-shell" id="main-content">
      <p>Public recipe search</p>
      <h1>Search is coming next.</h1>
      <p>
        This route is part of the application foundation. Recipe search and filters are not
        implemented yet.
      </p>
    </main>
  );
}
