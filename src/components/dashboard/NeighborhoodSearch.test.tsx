import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NeighborhoodSearch } from "@/components/dashboard/NeighborhoodSearch";

const counts = [
  { value: "CEDAR PARK/MEADOWBROOK", count: 944 },
  { value: "OLYMPIC HILLS/VICTORY HEIGHTS", count: 1410 },
];

describe("NeighborhoodSearch", () => {
  it("finds areas by a place inside them and selects with the keyboard", async () => {
    const onChange = vi.fn();
    render(<NeighborhoodSearch value={null} counts={counts} onChange={onChange} />);
    const box = screen.getByRole("combobox", { name: "Neighborhood" });

    await userEvent.type(box, "lake city");
    expect(box).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Cedar Park/Meadowbrookincludes Lake City944",
      "Olympic Hills/Victory Heightsincludes Lake City1,410",
    ]);

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("OLYMPIC HILLS/VICTORY HEIGHTS");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the selected name, clears it, and says when nothing matches", async () => {
    const onChange = vi.fn();
    render(<NeighborhoodSearch value="BALLARD" counts={null} onChange={onChange} />);
    const box = screen.getByRole("combobox", { name: "Neighborhood" });
    expect(box).toHaveValue("Ballard");

    await userEvent.click(screen.getByRole("button", { name: /clear neighborhood filter/i }));
    expect(onChange).toHaveBeenCalledWith(null);

    await userEvent.clear(box);
    await userEvent.type(box, "Bellevue");
    expect(screen.getByRole("option")).toHaveTextContent("No Seattle neighborhood matches “Bellevue”");

    await userEvent.keyboard("{Escape}");
    expect(box).toHaveAttribute("aria-expanded", "false");
    expect(box).toHaveValue("Ballard"); // reverts to the current selection
  });
});
