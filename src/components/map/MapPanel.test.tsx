import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real map needs WebGL; the legend is what's under test.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const { MapPanel } = await import("@/components/map/MapPanel");

function setViewportWide(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: wide, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

function renderPanel() {
  return render(
    <MapPanel data={null} loading={false} error={null} selectedId={null} focus={null} measure="count" onSelect={() => {}} onSelectArea={() => {}} />,
  );
}

describe("MapPanel layers control", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts collapsed on narrow screens and expands on tap", async () => {
    setViewportWide(false);
    renderPanel();
    const toggle = screen.getByRole("button", { name: /map layers/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Neighborhoods"); // current background shown while collapsed
    expect(screen.queryByText("Individual requests")).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Individual requests")).toBeInTheDocument();
  });

  it("starts expanded on wider screens and can be minimized", async () => {
    setViewportWide(true);
    renderPanel();
    const toggle = screen.getByRole("button", { name: /map layers/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radio", { name: "Density" })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio", { name: "Density" })).toBeNull();
  });
});
